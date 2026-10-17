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
    fs::write(&file.0, legacy.to_string()).unwrap();
    let imported = import_config(file.name()).unwrap();
    assert_eq!(
        serde_json::to_value(&imported).unwrap()["chewing_tsf"]["d512_suggestion_accept_key"],
        0
    );
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
