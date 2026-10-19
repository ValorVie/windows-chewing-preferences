// SPDX-FileCopyrightText: 2026 Chewing Project Authors
//
// SPDX-License-Identifier: GPL-3.0-or-later

use super::*;
use std::sync::{
    Mutex,
    atomic::{AtomicU64, Ordering},
};
use windows::Win32::System::Registry::{HKEY, HKEY_CURRENT_USER, RegOverridePredefKey};
use windows_registry::{CURRENT_USER, Key};

static REGISTRY_LOCK: Mutex<()> = Mutex::new(());
static NEXT_ID: AtomicU64 = AtomicU64::new(0);

fn unique_name() -> String {
    format!(
        "C3PreferencesTest-{}-{}",
        std::process::id(),
        NEXT_ID.fetch_add(1, Ordering::Relaxed)
    )
}

struct TempFile(PathBuf);
impl TempFile {
    fn new() -> Self {
        Self(
            std::env::temp_dir()
                .join(unique_name())
                .with_extension("toml"),
        )
    }
    fn name(&self) -> String {
        self.0.to_str().unwrap().to_owned()
    }
}
impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

// Same process-local HKCU redirection as chewing_tip_core's registry tests.
// Never open or change the user's production ChewingTextService key.
struct IsolatedRegistry {
    original: Key,
    root: Key,
    path: String,
}
impl IsolatedRegistry {
    fn new() -> Self {
        let original = CURRENT_USER.options().read().write().open("").unwrap();
        let path = format!("Software\\{}", unique_name());
        let root = original.create(&path).unwrap();
        unsafe {
            RegOverridePredefKey(HKEY_CURRENT_USER, Some(HKEY(root.as_raw())))
                .ok()
                .unwrap();
        }
        CURRENT_USER.create("Software\\ChewingTextService").unwrap();
        Self {
            original,
            root,
            path,
        }
    }
}
impl Drop for IsolatedRegistry {
    fn drop(&mut self) {
        unsafe {
            RegOverridePredefKey(HKEY_CURRENT_USER, None).ok().unwrap();
        }
        self.original.remove_tree(&self.path).unwrap();
    }
}

#[test]
fn personal_pref_defaults_and_legacy_import_use_shared_core() {
    let defaults = serde_json::to_value(Config::default()).unwrap();
    let assert_defaults = |config: &serde_json::Value| {
        assert_eq!(
            config["chewing_tsf"]["use_personal_candidate_preference"],
            true
        );
        assert_eq!(config["chewing_tsf"]["d512_personal_bonus"], 2.0);
        assert_eq!(config["chewing_tsf"]["d512_suggest_personal_bonus"], 2.0);
    };
    assert_defaults(&defaults);
    let mut legacy = toml::Value::try_from(Config::default()).unwrap();
    for field in [
        "use_personal_candidate_preference",
        "d512_personal_bonus",
        "d512_suggest_personal_bonus",
    ] {
        legacy["chewing_tsf"].as_table_mut().unwrap().remove(field);
    }
    legacy["chewing_tsf"]["d512_weight"] = toml::Value::Float(0.625);
    let file = TempFile::new();
    fs::write(&file.0, toml::to_string(&legacy).unwrap()).unwrap();
    let imported = serde_json::to_value(import_config(file.name()).unwrap()).unwrap();
    assert_defaults(&imported);
    assert_eq!(imported["chewing_tsf"]["d512_weight"], 0.625);
    let _lock = REGISTRY_LOCK.lock().unwrap();
    let _registry = IsolatedRegistry::new();
    assert_defaults(&serde_json::to_value(Config::from_reg().unwrap()).unwrap());
}

#[test]
fn personal_pref_round_trip_and_other_setting_edits_preserve_all_three_fields() {
    let mut wire = serde_json::to_value(Config::default()).unwrap();
    wire["chewing_tsf"]["use_personal_candidate_preference"] = false.into();
    wire["chewing_tsf"]["d512_personal_bonus"] = 0.625.into();
    wire["chewing_tsf"]["d512_suggest_personal_bonus"] = 1.875.into();
    let cfg: Config = serde_json::from_value(wire).unwrap();
    // Expected RED on the old core must fail before acquiring the mutex.
    assert_eq!(
        serde_json::to_value(cfg).unwrap()["chewing_tsf"]["d512_suggest_personal_bonus"],
        1.875
    );
    let _lock = REGISTRY_LOCK.lock().unwrap();
    let registry = IsolatedRegistry::new();
    let key = registry.root.open("Software\\ChewingTextService").unwrap();
    for enabled in [true, false] {
        for mode in [0, 1, 2] {
            for (automatic, suggestion) in [
                (0.0_f64, 1.875_f64),
                (1.66530964545728732, 0.0),
                (1e308, f64::MIN_POSITIVE),
            ] {
                let mut wire = serde_json::to_value(Config::default()).unwrap();
                wire["chewing_tsf"]["use_personal_candidate_preference"] = enabled.into();
                wire["chewing_tsf"]["d512_mode"] = mode.into();
                wire["chewing_tsf"]["d512_personal_bonus"] = automatic.into();
                wire["chewing_tsf"]["d512_suggest_personal_bonus"] = suggestion.into();
                let cfg: Config = serde_json::from_value(wire).unwrap();
                let cfg: Config =
                    serde_json::from_str(&serde_json::to_string(&cfg).unwrap()).unwrap();
                cfg.save_reg();
                assert_eq!(
                    key.get_u32("UsePersonalCandidatePreference").unwrap(),
                    u32::from(enabled)
                );
                for (name, expected) in [
                    ("D512PersonalBonus", automatic),
                    ("D512SuggestPersonalBonus", suggestion),
                ] {
                    assert_eq!(
                        key.get_string(name)
                            .unwrap()
                            .parse::<f64>()
                            .unwrap()
                            .to_bits(),
                        expected.to_bits()
                    );
                }
                let file = TempFile::new();
                export_config(file.name(), Config::from_reg().unwrap()).unwrap();
                let mut imported = import_config(file.name()).unwrap();
                let actual = serde_json::to_value(&imported).unwrap();
                assert_eq!(
                    actual["chewing_tsf"]["use_personal_candidate_preference"],
                    enabled
                );
                for (field, expected) in [
                    ("d512_personal_bonus", automatic),
                    ("d512_suggest_personal_bonus", suggestion),
                ] {
                    assert_eq!(
                        actual["chewing_tsf"][field].as_f64().unwrap().to_bits(),
                        expected.to_bits()
                    );
                }
                imported.chewing_tsf.esc_clean_all_buf = true;
                imported.save_reg();
                let reloaded = serde_json::to_value(Config::from_reg().unwrap()).unwrap();
                for field in [
                    "use_personal_candidate_preference",
                    "d512_personal_bonus",
                    "d512_suggest_personal_bonus",
                ] {
                    assert_eq!(reloaded["chewing_tsf"][field], actual["chewing_tsf"][field]);
                }
                assert_eq!(reloaded["chewing_tsf"]["esc_clean_all_buf"], true);
            }
        }
    }
}

#[test]
fn personal_pref_invalid_bonuses_are_rejected_before_save_export_and_after_import() {
    for mode in [0, 1, 2] {
        for field in ["d512_personal_bonus", "d512_suggest_personal_bonus"] {
            for value in [-0.1, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
                let mut input = toml::Value::try_from(Config::default()).unwrap();
                input["chewing_tsf"]["d512_mode"] = toml::Value::Integer(mode);
                input["chewing_tsf"]
                    .as_table_mut()
                    .unwrap()
                    .insert(field.into(), toml::Value::Float(value));
                let content = toml::to_string(&input).unwrap();
                let cfg: Config = toml::from_str(&content).unwrap();
                assert!(
                    validate_d512(&cfg).is_err(),
                    "{field}={value} must fail before save"
                );
                assert!(save_config(cfg).is_err());
                let cfg: Config = toml::from_str(&content).unwrap();
                let output = TempFile::new();
                assert!(export_config(output.name(), cfg).is_err());
                assert!(!output.0.exists());
                let file = TempFile::new();
                fs::write(&file.0, content).unwrap();
                assert!(import_config(file.name()).is_err());
            }
        }
    }
}

#[test]
fn input_habits_defaults_and_legacy_import_use_shared_core() {
    let defaults = serde_json::to_value(Config::default()).unwrap();
    assert_eq!(defaults["chewing_tsf"]["ctrl_symbol_new_phonetic"], false);
    assert_eq!(defaults["chewing_tsf"]["cursor_wrap"], false);
    let mut legacy = toml::Value::try_from(Config::default()).unwrap();
    let settings = legacy["chewing_tsf"].as_table_mut().unwrap();
    settings.remove("ctrl_symbol_new_phonetic");
    settings.remove("cursor_wrap");
    let file = TempFile::new();
    fs::write(&file.0, toml::to_string(&legacy).unwrap()).unwrap();
    let imported = serde_json::to_value(import_config(file.name()).unwrap()).unwrap();
    assert_eq!(imported["chewing_tsf"]["ctrl_symbol_new_phonetic"], false);
    assert_eq!(imported["chewing_tsf"]["cursor_wrap"], false);

    let _lock = REGISTRY_LOCK.lock().unwrap();
    let _registry = IsolatedRegistry::new();
    let loaded = serde_json::to_value(Config::from_reg().unwrap()).unwrap();
    assert_eq!(loaded["chewing_tsf"]["ctrl_symbol_new_phonetic"], false);
    assert_eq!(loaded["chewing_tsf"]["cursor_wrap"], false);
}

#[test]
fn input_habits_round_trip_and_survive_other_setting_edits() {
    let pairs = [(true, false), (false, true), (true, true), (false, false)];
    // Detect a core that drops unknown fields before acquiring the registry
    // lock, so expected RED failures cannot poison the other registry tests.
    for (ctrl, wrap) in pairs {
        let mut wire = serde_json::to_value(Config::default()).unwrap();
        wire["chewing_tsf"]["ctrl_symbol_new_phonetic"] = ctrl.into();
        wire["chewing_tsf"]["cursor_wrap"] = wrap.into();
        let cfg: Config = serde_json::from_value(wire).unwrap();
        let actual = serde_json::to_value(cfg).unwrap();
        assert_eq!(actual["chewing_tsf"]["ctrl_symbol_new_phonetic"], ctrl);
        assert_eq!(actual["chewing_tsf"]["cursor_wrap"], wrap);
    }

    let _lock = REGISTRY_LOCK.lock().unwrap();
    let registry = IsolatedRegistry::new();
    let key = registry.root.open("Software\\ChewingTextService").unwrap();
    for (ctrl, wrap) in pairs {
        let mut wire = serde_json::to_value(Config::default()).unwrap();
        wire["chewing_tsf"]["ctrl_symbol_new_phonetic"] = ctrl.into();
        wire["chewing_tsf"]["cursor_wrap"] = wrap.into();
        let cfg: Config = serde_json::from_value(wire).unwrap();
        cfg.save_reg();
        assert_eq!(
            key.get_u32("CtrlSymbolNewPhonetic").unwrap(),
            u32::from(ctrl)
        );
        assert_eq!(key.get_u32("CursorWrap").unwrap(), u32::from(wrap));
        let loaded = Config::from_reg().unwrap();
        let actual = serde_json::to_value(&loaded).unwrap();
        assert_eq!(actual["chewing_tsf"]["ctrl_symbol_new_phonetic"], ctrl);
        assert_eq!(actual["chewing_tsf"]["cursor_wrap"], wrap);
        let file = TempFile::new();
        export_config(file.name(), loaded).unwrap();
        let mut imported = import_config(file.name()).unwrap();
        let actual = serde_json::to_value(&imported).unwrap();
        assert_eq!(actual["chewing_tsf"]["ctrl_symbol_new_phonetic"], ctrl);
        assert_eq!(actual["chewing_tsf"]["cursor_wrap"], wrap);
        imported.chewing_tsf.esc_clean_all_buf = true;
        imported.save_reg();
        assert_eq!(
            key.get_u32("CtrlSymbolNewPhonetic").unwrap(),
            u32::from(ctrl)
        );
        assert_eq!(key.get_u32("CursorWrap").unwrap(), u32::from(wrap));
        let reloaded = serde_json::to_value(Config::from_reg().unwrap()).unwrap();
        assert_eq!(reloaded["chewing_tsf"]["ctrl_symbol_new_phonetic"], ctrl);
        assert_eq!(reloaded["chewing_tsf"]["cursor_wrap"], wrap);
        assert_eq!(reloaded["chewing_tsf"]["esc_clean_all_buf"], true);
    }
}

#[test]
fn d512_json_and_registry_round_trip_preserves_raw_modes_and_f64_bits() {
    let _lock = REGISTRY_LOCK.lock().unwrap();
    let registry = IsolatedRegistry::new();
    let key = registry.root.open("Software\\ChewingTextService").unwrap();
    for mode in [0, 1, 2] {
        for value in [
            0.0_f64,
            0.25,
            0.12345678901234566,
            f64::from_bits(0.25_f64.to_bits() + 1),
            f64::MIN_POSITIVE,
            1e308,
        ] {
            let mut cfg = Config::default();
            cfg.chewing_tsf.d512_mode = mode;
            cfg.chewing_tsf.d512_weight = value;
            cfg.chewing_tsf.d512_margin = value;
            let wire = serde_json::to_string(&cfg).unwrap();
            let cfg: Config = serde_json::from_str(&wire).unwrap();
            assert_eq!(
                cfg.chewing_tsf.d512_weight.to_bits(),
                value.to_bits(),
                "JSON precision"
            );
            cfg.save_reg();
            assert_eq!(key.get_u32("D512Mode").unwrap(), mode as u32);
            assert_eq!(
                key.get_string("D512Weight")
                    .unwrap()
                    .parse::<f64>()
                    .unwrap()
                    .to_bits(),
                value.to_bits()
            );
            assert_eq!(
                key.get_string("D512Margin")
                    .unwrap()
                    .parse::<f64>()
                    .unwrap()
                    .to_bits(),
                value.to_bits()
            );
            let loaded = Config::from_reg().unwrap();
            assert_eq!(
                loaded.chewing_tsf.d512_mode, mode,
                "raw mode must survive settings reload"
            );
            assert_eq!(loaded.chewing_tsf.d512_weight.to_bits(), value.to_bits());
            assert_eq!(loaded.chewing_tsf.d512_margin.to_bits(), value.to_bits());
        }
    }
}

#[test]
fn d512_accept_key_round_trips_raw_values_through_json_registry_and_toml() {
    let _lock = REGISTRY_LOCK.lock().unwrap();
    let registry = IsolatedRegistry::new();
    let key = registry.root.open("Software\\ChewingTextService").unwrap();
    for mode in [0, 1, 2] {
        for raw in [0, 1, 2, 3, -1, i32::MIN, i32::MAX] {
            let mut wire = serde_json::to_value(Config::default()).unwrap();
            wire["chewing_tsf"]["d512_mode"] = mode.into();
            wire["chewing_tsf"]["d512_suggestion_accept_key"] = raw.into();
            let cfg: Config = serde_json::from_value(wire).unwrap();
            assert_eq!(
                serde_json::to_value(&cfg).unwrap()["chewing_tsf"]["d512_suggestion_accept_key"],
                raw,
                "JSON must retain the raw key"
            );
            cfg.save_reg();
            assert_eq!(key.get_u32("D512SuggestionAcceptKey").unwrap(), raw as u32);
            let loaded = Config::from_reg().unwrap();
            assert_eq!(
                serde_json::to_value(&loaded).unwrap()["chewing_tsf"]["d512_suggestion_accept_key"],
                raw,
                "disabled modes and unknown keys must survive registry reload"
            );
            let file = TempFile::new();
            export_config(file.name(), loaded).unwrap();
            let imported = import_config(file.name()).unwrap();
            assert_eq!(
                serde_json::to_value(&imported).unwrap()["chewing_tsf"]["d512_suggestion_accept_key"],
                raw,
                "TOML must retain the raw key"
            );
        }
    }
}

#[test]
fn d512_legacy_import_defaults_accept_key_to_tab() {
    let mut legacy = toml::Value::try_from(Config::default()).unwrap();
    legacy["chewing_tsf"]
        .as_table_mut()
        .unwrap()
        .remove("d512_suggestion_accept_key");
    let file = TempFile::new();
    fs::write(&file.0, toml::to_string(&legacy).unwrap()).unwrap();
    let imported = import_config(file.name()).unwrap();
    assert_eq!(
        serde_json::to_value(&imported).unwrap()["chewing_tsf"]["d512_suggestion_accept_key"],
        0
    );
}

#[test]
fn d512_two_mode_defaults_match_the_shared_contract() {
    let defaults = serde_json::to_value(Config::default()).unwrap();
    let settings = &defaults["chewing_tsf"];
    assert_eq!(settings["d512_weight"], 0.25);
    assert_eq!(settings["d512_margin"], 0.5);
    assert_eq!(settings["d512_suggest_weight"], 0.25);
    assert_eq!(settings["d512_suggest_margin"], 2.0);
    assert_eq!(settings["d512_log_calibration"], 0);
}

#[test]
fn d512_two_mode_parameters_and_log_flag_round_trip_independently() {
    let mut wire = serde_json::to_value(Config::default()).unwrap();
    for (field, value) in [
        ("d512_weight", 0.375),
        ("d512_margin", 0.625),
        ("d512_suggest_weight", 0.12345678901234566),
        ("d512_suggest_margin", 1.25),
    ] {
        wire["chewing_tsf"][field] = value.into();
    }
    let cfg: Config = serde_json::from_value(wire.clone()).unwrap();
    // Check the wire contract before acquiring the registry lock so an expected
    // RED on an old core cannot poison unrelated registry tests.
    assert_eq!(
        serde_json::to_value(cfg).unwrap()["chewing_tsf"]["d512_suggest_weight"],
        0.12345678901234566
    );
    let _lock = REGISTRY_LOCK.lock().unwrap();
    let registry = IsolatedRegistry::new();
    let key = registry.root.open("Software\\ChewingTextService").unwrap();
    for mode in [0, 1, 2] {
        for log in [0, 1] {
            wire["chewing_tsf"]["d512_mode"] = mode.into();
            wire["chewing_tsf"]["d512_log_calibration"] = log.into();
            let cfg: Config = serde_json::from_value(wire.clone()).unwrap();
            cfg.save_reg();
            assert_eq!(key.get_u32("D512LogCalibration").unwrap(), log as u32);
            for (name, expected) in [
                ("D512Weight", 0.375_f64),
                ("D512Margin", 0.625),
                ("D512SuggestWeight", 0.12345678901234566),
                ("D512SuggestMargin", 1.25),
            ] {
                assert_eq!(
                    key.get_string(name)
                        .unwrap()
                        .parse::<f64>()
                        .unwrap()
                        .to_bits(),
                    expected.to_bits()
                );
            }
            let loaded = Config::from_reg().unwrap();
            let file = TempFile::new();
            export_config(file.name(), loaded).unwrap();
            let imported = serde_json::to_value(import_config(file.name()).unwrap()).unwrap();
            for field in [
                "d512_mode",
                "d512_weight",
                "d512_margin",
                "d512_suggest_weight",
                "d512_suggest_margin",
                "d512_log_calibration",
            ] {
                assert_eq!(
                    imported["chewing_tsf"][field], wire["chewing_tsf"][field],
                    "{field}"
                );
            }
        }
    }
}

#[test]
fn d512_legacy_import_defaults_new_fields_without_overwriting_existing_parameters() {
    let mut legacy = toml::Value::try_from(Config::default()).unwrap();
    legacy["chewing_tsf"]["d512_weight"] = toml::Value::Float(0.75);
    legacy["chewing_tsf"]["d512_margin"] = toml::Value::Float(0.375);
    for field in [
        "d512_suggest_weight",
        "d512_suggest_margin",
        "d512_log_calibration",
    ] {
        legacy["chewing_tsf"].as_table_mut().unwrap().remove(field);
    }
    let file = TempFile::new();
    fs::write(&file.0, toml::to_string(&legacy).unwrap()).unwrap();
    let imported = serde_json::to_value(import_config(file.name()).unwrap()).unwrap();
    let settings = &imported["chewing_tsf"];
    assert_eq!(settings["d512_weight"], 0.75);
    assert_eq!(settings["d512_margin"], 0.375);
    assert_eq!(settings["d512_suggest_weight"], 0.25);
    assert_eq!(settings["d512_suggest_margin"], 2.0);
    assert_eq!(settings["d512_log_calibration"], 0);
}

#[test]
fn d512_invalid_suggestion_parameters_are_rejected_on_import_and_export() {
    for mode in [0, 1, 2] {
        for (weight, margin) in [
            (-0.1, 2.0),
            (0.25, -0.1),
            (f64::NAN, 2.0),
            (0.25, f64::INFINITY),
        ] {
            let mut input = toml::Value::try_from(Config::default()).unwrap();
            input["chewing_tsf"]["d512_mode"] = toml::Value::Integer(mode);
            input["chewing_tsf"]
                .as_table_mut()
                .unwrap()
                .insert("d512_suggest_weight".into(), toml::Value::Float(weight));
            input["chewing_tsf"]
                .as_table_mut()
                .unwrap()
                .insert("d512_suggest_margin".into(), toml::Value::Float(margin));
            let content = toml::to_string(&input).unwrap();
            let cfg: Config = toml::from_str(&content).unwrap();
            let output = TempFile::new();
            assert!(export_config(output.name(), cfg).is_err());
            assert!(!output.0.exists());
            let file = TempFile::new();
            fs::write(&file.0, content).unwrap();
            assert!(import_config(file.name()).is_err());
        }
    }
}

#[test]
fn d512_json_round_trip_preserves_representative_positive_f64_values() {
    let mut seed = 0x51220261017_u64;
    for _ in 0..1024 {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        let value = f64::from_bits(0x3ff0000000000000 | (seed & 0x000fffffffffffff));
        let mut cfg = Config::default();
        cfg.chewing_tsf.d512_weight = value;
        let encoded = serde_json::to_string(&cfg).unwrap();
        let decoded: Config = serde_json::from_str(&encoded).unwrap();
        assert_eq!(
            decoded.chewing_tsf.d512_weight.to_bits(),
            value.to_bits(),
            "input: {value:.17}"
        );
    }
}

#[test]
fn d512_export_and_import_preserve_mode_and_parameter_precision() {
    for mode in [0, 1, 2] {
        let file = TempFile::new();
        let mut cfg = Config::default();
        cfg.chewing_tsf.d512_mode = mode;
        cfg.chewing_tsf.d512_weight = 0.12345678901234566;
        cfg.chewing_tsf.d512_margin = 0.0;
        export_config(file.name(), cfg).unwrap();
        let imported = import_config(file.name()).unwrap();
        assert_eq!(imported.chewing_tsf.d512_mode, mode);
        assert_eq!(
            imported.chewing_tsf.d512_weight.to_bits(),
            0.12345678901234566_f64.to_bits()
        );
        assert_eq!(imported.chewing_tsf.d512_margin, 0.0);
    }
}

#[test]
fn d512_invalid_export_is_rejected_before_creating_a_file() {
    for (mode, weight, margin) in [
        (3, 0.25, 0.25),
        (1, -0.1, 0.25),
        (1, 0.25, -0.1),
        (1, f64::NAN, 0.25),
        (1, 0.25, f64::INFINITY),
    ] {
        let file = TempFile::new();
        let mut cfg = Config::default();
        cfg.chewing_tsf.d512_mode = mode;
        cfg.chewing_tsf.d512_weight = weight;
        cfg.chewing_tsf.d512_margin = margin;
        assert!(export_config(file.name(), cfg).is_err());
        assert!(!file.0.exists());
    }
}

#[test]
fn d512_invalid_import_is_rejected() {
    for (mode, weight, margin) in [
        (3, 0.25, 0.25),
        (1, -0.1, 0.25),
        (1, 0.25, -0.1),
        (1, f64::NAN, 0.25),
        (1, 0.25, f64::INFINITY),
    ] {
        let file = TempFile::new();
        let mut cfg = Config::default();
        cfg.chewing_tsf.d512_mode = mode;
        cfg.chewing_tsf.d512_weight = weight;
        cfg.chewing_tsf.d512_margin = margin;
        fs::write(&file.0, toml::to_string(&cfg).unwrap()).unwrap();
        assert!(import_config(file.name()).is_err());
    }
}
