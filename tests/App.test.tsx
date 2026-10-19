// SPDX-FileCopyrightText: 2026 Chewing Project Authors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";

const { invoke, listeners, dialogOpen, dialogSave, message } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: new Map<string, () => Promise<void>>(),
  dialogOpen: vi.fn(), dialogSave: vi.fn(), message: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockImplementation(async (event, callback) => {
    listeners.set(event, callback);
    return () => { if (listeners.get(event) === callback) listeners.delete(event); };
  }),
}));
vi.mock("@tauri-apps/plugin-process", () => ({ exit: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: dialogOpen, save: dialogSave, message }));

// Synthetic data only. The backend boundary is mocked; all controls are real.
const storedConfig = {
  chewing_tsf: {
    switch_lang_with_shift: false, shift_key_sensitivity: 0,
    enable_fullwidth_toggle_key: false, enable_caps_lock: false,
    lock_chinese_on_caps_lock: false, show_notification: false,
    enable_auto_learn: false, esc_clean_all_buf: false,
    use_personal_candidate_preference: true,
    ctrl_symbol_new_phonetic: true, cursor_wrap: false,
    full_shape_symbols: false, upper_case_with_shift: false,
    add_phrase_forward: false, phrase_choice_rearward: false,
    easy_symbols_with_shift: false, easy_symbols_with_shift_ctrl: false,
    cursor_cand_list: false, sort_candidates_by_frequency: false,
    show_cand_with_space_key: false, advance_after_selection: false,
    default_full_space: false, default_english: false, output_simp_chinese: false,
    sel_key_type: 0, conv_engine: 1, cand_per_row: 5, cand_per_page: 10,
    d512_mode: 1, d512_weight: 0.25, d512_margin: 0.5, d512_suggestion_accept_key: 0,
    d512_suggest_weight: 0.25, d512_suggest_margin: 2, d512_log_calibration: 0,
    d512_personal_bonus: 2, d512_suggest_personal_bonus: 2,
    font_size: 16, font_family: "Test Font", font_fg_color: "#000000",
    font_bg_color: "#ffffff", font_highlight_fg_color: "#ffffff",
    font_highlight_bg_color: "#000000", font_number_fg_color: "#000000",
    cand_list_border_color: "#000000", notify_fg_color: "#000000",
    notify_bg_color: "#ffffff", notify_border_color: "#000000",
    keyboard_layout: 0, simulate_english_layout: 0,
    sync_lang_mode_openclose: false,
    keybind: [{ key: "A", action: "text", param: "synthetic" }],
    auto_check_update_channel: "stable", update_info_url: "https://example.invalid/",
    last_update_check_time: 0, modified_timestamp: 0,
  },
  symbols_dat: "", swkb_dat: "",
};
let loadedConfig = structuredClone(storedConfig);
let importedConfig = structuredClone(storedConfig);

beforeEach(() => {
  invoke.mockReset();
  listeners.clear();
  loadedConfig = structuredClone(storedConfig);
  importedConfig = structuredClone(storedConfig);
  dialogOpen.mockResolvedValue("/synthetic/import.toml");
  dialogSave.mockResolvedValue("/synthetic/export.toml");
  message.mockReset();
  invoke.mockImplementation(async (command: string) => {
    if (command === "load_config") return structuredClone(loadedConfig);
    if (command === "import_config") return structuredClone(importedConfig);
    if (command === "get_system_fonts") return [];
    if (command === "save_config" || command === "export_config") return;
    throw new Error(`Unexpected command: ${command}`);
  });
});
afterEach(cleanup);

async function openD512() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("checkbox", { name: "使用 CapsLock 快速切換中英文" });
  await user.click(screen.getByRole("tab", { name: "其他設定" }));
  return user;
}

test.each([true, false])("personal preference %s loads from core and saves independently of auto learning", async (enabled) => {
  loadedConfig.chewing_tsf.use_personal_candidate_preference = enabled;
  const user = userEvent.setup();
  render(<App />);
  const checkbox = await screen.findByRole<HTMLInputElement>("checkbox", { name: "使用個人選字偏好" });
  expect(checkbox.checked).toBe(enabled);
  expect(screen.getByText("記住有效送出的手動選字，依近期偏好直接組字並調整多字詞的候選順序。關閉會保留記錄。")).toBeTruthy();
  expect(invoke.mock.calls.some(([command]) => command === "save_config")).toBe(false);
  await user.click(checkbox);
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...loadedConfig, chewing_tsf: { ...loadedConfig.chewing_tsf, use_personal_candidate_preference: !enabled },
  } });
});

test.each([1, 2])("mode %i edits only its personal bonus and every preset preserves both bonuses", async (mode) => {
  loadedConfig.chewing_tsf.d512_mode = mode;
  loadedConfig.chewing_tsf.d512_personal_bonus = 0.625;
  loadedConfig.chewing_tsf.d512_suggest_personal_bonus = 1.875;
  const user = await openD512();
  const bonus = () => screen.getByRole<HTMLInputElement>("textbox", { name: "個人學習加分 b" });
  expect(screen.getAllByRole("textbox", { name: "個人學習加分 b" })).toHaveLength(1);
  expect(bonus().value).toBe(mode === 1 ? "0.625" : "1.875");
  await user.clear(bonus());
  await user.type(bonus(), "3.125");
  const otherMode = mode === 1 ? 2 : 1;
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), String(otherMode));
  expect(bonus().value).toBe(mode === 1 ? "1.875" : "0.625");
  for (const activeMode of [mode, otherMode]) {
    await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), String(activeMode));
    const before = bonus().value;
    for (const preset of ["conservative", "aggressive", "balanced"]) {
      await user.selectOptions(screen.getByRole("combobox", { name: "D512 檔位" }), preset);
      expect(bonus().value).toBe(before);
    }
  }
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), String(mode));
  expect(bonus().value).toBe("3.125");
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...loadedConfig, chewing_tsf: { ...loadedConfig.chewing_tsf,
      [mode === 1 ? "d512_personal_bonus" : "d512_suggest_personal_bonus"]: 3.125 },
  } });
});

test.each([1, 2])("mode %i saves zero bonus and preserves personal settings when saving another tab", async (mode) => {
  loadedConfig.chewing_tsf.d512_mode = mode;
  loadedConfig.chewing_tsf.use_personal_candidate_preference = false;
  loadedConfig.chewing_tsf.d512_personal_bonus = 0.625;
  loadedConfig.chewing_tsf.d512_suggest_personal_bonus = 1.875;
  const user = await openD512();
  const bonus = screen.getByRole("textbox", { name: "個人學習加分 b" });
  await user.clear(bonus);
  await user.type(bonus, "0");
  await user.click(screen.getByRole("tab", { name: "打字行為" }));
  await user.click(screen.getByRole("checkbox", { name: "使用 Esc 清空編輯區字串" }));
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...loadedConfig, chewing_tsf: { ...loadedConfig.chewing_tsf, esc_clean_all_buf: true,
      [mode === 1 ? "d512_personal_bonus" : "d512_suggest_personal_bonus"]: 0 },
  } });
});

test.each([1, 2])("mode %i rejects invalid bonuses including hidden drafts and retains the latest valid saved fallback", async (mode) => {
  loadedConfig.chewing_tsf.d512_mode = mode;
  const user = await openD512();
  const bonus = () => screen.getByRole<HTMLInputElement>("textbox", { name: "個人學習加分 b" });
  await user.clear(bonus());
  await user.type(bonus(), "1.66530964545728732");
  await user.click(screen.getByRole("button", { name: "套用" }));
  invoke.mockClear();
  for (const invalid of ["", "-0.1", "NaN", "Infinity", "1e309"]) {
    await user.clear(bonus());
    if (invalid) await user.type(bonus(), invalid);
    expect(bonus().getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByRole("button", { name: "套用" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "確定" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { await listeners.get("export")!(); });
    expect(invoke.mock.calls.some(([command]) => command === "export_config")).toBe(false);
  }
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), String(mode === 1 ? 2 : 1));
  expect((screen.getByRole("button", { name: "套用" }) as HTMLButtonElement).disabled).toBe(true);
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "0");
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...loadedConfig, chewing_tsf: { ...loadedConfig.chewing_tsf, d512_mode: 0,
      [mode === 1 ? "d512_personal_bonus" : "d512_suggest_personal_bonus"]: Number("1.66530964545728732") },
  } });
});

test("import loads personal preference and both bonuses and export preserves edits across tabs", async () => {
  const user = await openD512();
  importedConfig.chewing_tsf.use_personal_candidate_preference = false;
  importedConfig.chewing_tsf.d512_personal_bonus = 0.625;
  importedConfig.chewing_tsf.d512_suggest_personal_bonus = 1.875;
  await act(async () => { await listeners.get("import")!(); });
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "個人學習加分 b" }).value).toBe("0.625");
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "2");
  const bonus = screen.getByRole<HTMLInputElement>("textbox", { name: "個人學習加分 b" });
  expect(bonus.value).toBe("1.875");
  await user.clear(bonus);
  await user.type(bonus, "0");
  await user.click(screen.getByRole("tab", { name: "打字行為" }));
  const checkbox = screen.getByRole<HTMLInputElement>("checkbox", { name: "使用個人選字偏好" });
  expect(checkbox.checked).toBe(false);
  await user.click(checkbox);
  await act(async () => { await listeners.get("export")!(); });
  expect(invoke).toHaveBeenCalledWith("export_config", { path: "/synthetic/export.toml", config: {
    ...importedConfig, chewing_tsf: { ...importedConfig.chewing_tsf, d512_mode: 2,
      use_personal_candidate_preference: true, d512_suggest_personal_bonus: 0 },
  } });
});

test.each([
  [true, false], [false, true], [true, true], [false, false],
])("input habits %s/%s load and toggle independently before saving", async (ctrl, wrap) => {
  loadedConfig.chewing_tsf.ctrl_symbol_new_phonetic = ctrl;
  loadedConfig.chewing_tsf.cursor_wrap = wrap;
  const user = userEvent.setup();
  render(<App />);
  const ctrlBox = await screen.findByRole<HTMLInputElement>("checkbox", { name: "ctrl符號輸出(新注音模式)" });
  const wrapBox = screen.getByRole<HTMLInputElement>("checkbox", { name: "組字區游標左右循環" });
  expect(ctrlBox.checked).toBe(ctrl);
  expect(wrapBox.checked).toBe(wrap);
  expect(screen.getByText("組字中按 Ctrl+， 。 ； ' [ ] 輸入，。；、【】")).toBeTruthy();
  expect(screen.getByText("游標在組字區最右邊時按右方向鍵跳到最左邊，反之亦然")).toBeTruthy();
  expect(invoke.mock.calls.some(([command]) => command === "save_config")).toBe(false);
  await user.click(ctrlBox);
  expect(ctrlBox.checked).toBe(!ctrl);
  expect(wrapBox.checked).toBe(wrap);
  await user.click(wrapBox);
  expect(ctrlBox.checked).toBe(!ctrl);
  expect(wrapBox.checked).toBe(!wrap);
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf,
      ctrl_symbol_new_phonetic: !ctrl, cursor_wrap: !wrap },
  } });
});

test.each([
  [true, false], [false, true], [true, true], [false, false],
])("saving another tab preserves loaded input habits %s/%s", async (ctrl, wrap) => {
  loadedConfig.chewing_tsf.ctrl_symbol_new_phonetic = ctrl;
  loadedConfig.chewing_tsf.cursor_wrap = wrap;
  const user = await openD512();
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "2");
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf,
      d512_mode: 2, ctrl_symbol_new_phonetic: ctrl, cursor_wrap: wrap },
  } });
});

test("import loads both input habits and export retains edits after changing tabs", async () => {
  const user = await openD512();
  importedConfig.chewing_tsf.ctrl_symbol_new_phonetic = false;
  importedConfig.chewing_tsf.cursor_wrap = true;
  await act(async () => { await listeners.get("import")!(); });
  await user.click(screen.getByRole("tab", { name: "打字行為" }));
  const ctrlBox = screen.getByRole<HTMLInputElement>("checkbox", { name: "ctrl符號輸出(新注音模式)" });
  const wrapBox = screen.getByRole<HTMLInputElement>("checkbox", { name: "組字區游標左右循環" });
  expect(ctrlBox.checked).toBe(false);
  expect(wrapBox.checked).toBe(true);
  await user.click(wrapBox);
  await user.click(screen.getByRole("tab", { name: "其他設定" }));
  await act(async () => { await listeners.get("export")!(); });
  expect(invoke).toHaveBeenCalledWith("export_config", { path: "/synthetic/export.toml", config: {
    ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf,
      ctrl_symbol_new_phonetic: false, cursor_wrap: false },
  } });
});

test("shows shared defaults and calibrated presets", async () => {
  await openD512();
  expect((screen.getByRole("combobox", { name: "D512 模式" }) as HTMLSelectElement).value).toBe("1");
  expect((screen.getByRole("combobox", { name: "D512 檔位" }) as HTMLSelectElement).value).toBe("balanced");
  expect((screen.getByRole("textbox", { name: "重排權重 w" }) as HTMLInputElement).value).toBe("0.25");
  expect((screen.getByRole("textbox", { name: "替換門檻 τ" }) as HTMLInputElement).value).toBe("0.5");
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "個人學習加分 b" }).value).toBe("2");
  expect((screen.getByRole("option", { name: "保守" }) as HTMLOptionElement).disabled).toBe(false);
  expect((screen.getByRole("option", { name: "積極" }) as HTMLOptionElement).disabled).toBe(false);
  const accept = screen.getByRole("combobox", { name: "接受建議的按鍵" }) as HTMLSelectElement;
  expect(accept.value).toBe("0");
  expect(accept.disabled).toBe(true);
  expect((screen.getByRole("checkbox", { name: "記錄 D512 校準資料" }) as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText(/紀錄包含您的個人打字資料，預設關閉/)).toBeTruthy();
  expect(screen.queryByText(/尚未接上儲存/)).toBeNull();
});

test.each([
  [1, "conservative", "1", "d512_weight", "d512_margin"],
  [1, "balanced", "0.5", "d512_weight", "d512_margin"],
  [1, "aggressive", "0.2", "d512_weight", "d512_margin"],
  [2, "conservative", "3", "d512_suggest_weight", "d512_suggest_margin"],
  [2, "balanced", "2", "d512_suggest_weight", "d512_suggest_margin"],
  [2, "aggressive", "1", "d512_suggest_weight", "d512_suggest_margin"],
] as const)("mode %i selecting %s fills its own pair and derives custom after editing", async (mode, presetName, marginValue, weightKey, marginKey) => {
  loadedConfig.chewing_tsf.d512_mode = mode;
  const user = await openD512();
  const preset = screen.getByRole("combobox", { name: "D512 檔位" });
  const weight = screen.getByRole("textbox", { name: "重排權重 w" });
  const margin = screen.getByRole("textbox", { name: "替換門檻 τ" });
  await user.selectOptions(preset, presetName);
  expect((weight as HTMLInputElement).value).toBe("0.25");
  expect((margin as HTMLInputElement).value).toBe(marginValue);
  expect((preset as HTMLSelectElement).value).toBe(presetName);
  await user.clear(margin);
  await user.type(margin, "0.625");
  expect((preset as HTMLSelectElement).value).toBe("custom");
  await user.selectOptions(preset, presetName);
  await user.selectOptions(preset, "custom");
  expect((preset as HTMLSelectElement).value).toBe(presetName);
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf,
      d512_mode: mode, [weightKey]: 0.25, [marginKey]: Number(marginValue) },
  } });
});

test.each([0, 1, 2])("acceptance key %i loads and can be selected and saved in suggestion mode", async (key) => {
  loadedConfig.chewing_tsf.d512_mode = 2;
  loadedConfig.chewing_tsf.d512_suggestion_accept_key = (key + 1) % 3;
  const user = await openD512();
  const accept = screen.getByRole("combobox", { name: "接受建議的按鍵" }) as HTMLSelectElement;
  expect(accept.disabled).toBe(false);
  expect(accept.value).toBe(String((key + 1) % 3));
  expect(screen.getByRole("option", { name: ["Tab", "Ctrl+Tab", "右方向鍵（句尾）"][key] })).toBeTruthy();
  await user.selectOptions(accept, String(key));
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf, d512_mode: 2, d512_suggestion_accept_key: key },
  } });
});

test.each([0, 1] as const)("mode %i disables acceptance editing and preserves the chosen key when saving another tab", async (mode) => {
  loadedConfig.chewing_tsf.d512_mode = mode;
  loadedConfig.chewing_tsf.d512_suggestion_accept_key = 2;
  const user = await openD512();
  const accept = screen.getByRole("combobox", { name: "接受建議的按鍵" }) as HTMLSelectElement;
  expect(accept.disabled).toBe(true);
  expect(accept.value).toBe("2");
  const modeSelect = screen.getByRole("combobox", { name: "D512 模式" });
  await user.selectOptions(modeSelect, "2");
  expect(accept.disabled).toBe(false);
  expect(accept.value).toBe("2");
  await user.selectOptions(modeSelect, String(mode));
  expect(accept.disabled).toBe(true);
  await user.click(screen.getByRole("tab", { name: "打字行為" }));
  await user.click(screen.getByRole("checkbox", { name: "使用 Esc 清空編輯區字串" }));
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf, d512_mode: mode,
      d512_suggestion_accept_key: 2, esc_clean_all_buf: true },
  } });
});

test.each([-1, 3, 2147483647])("unknown acceptance key %i displays Tab while retaining the raw value until edited", async (raw) => {
  loadedConfig.chewing_tsf.d512_mode = 2;
  loadedConfig.chewing_tsf.d512_suggestion_accept_key = raw;
  const user = await openD512();
  const accept = screen.getByRole("combobox", { name: "接受建議的按鍵" }) as HTMLSelectElement;
  expect(accept.value).toBe("0");
  expect(invoke.mock.calls.some(([command]) => command === "save_config")).toBe(false);
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "1");
  expect(accept.disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf, d512_suggestion_accept_key: raw },
  } });
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "2");
  await user.selectOptions(accept, "1");
  await user.selectOptions(accept, "0");
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenLastCalledWith("save_config", { config: {
    ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf, d512_mode: 2, d512_suggestion_accept_key: 0 },
  } });
});

test("mode 2 is named suggestion without the unsupported disclaimer", async () => {
  const user = await openD512();
  const mode = screen.getByRole("combobox", { name: "D512 模式" });
  await user.selectOptions(mode, "2");
  expect((mode as HTMLSelectElement).value).toBe("2");
  expect(screen.getByRole("option", { name: "僅建議" })).toBeTruthy();
  expect(screen.queryByText(/尚未支援|暫時等同自動/)).toBeNull();
});

test("numeric edits derive custom without truncating decimal text, and balanced fills both values", async () => {
  const user = await openD512();
  const weight = screen.getByRole("textbox", { name: "重排權重 w" });
  const margin = screen.getByRole("textbox", { name: "替換門檻 τ" });
  const preset = screen.getByRole("combobox", { name: "D512 檔位" });
  await user.clear(weight);
  await user.type(weight, "0.25000000000000001");
  await user.clear(margin);
  await user.type(margin, "0.37512345678912345");
  expect((preset as HTMLSelectElement).value).toBe("custom");
  expect((weight as HTMLInputElement).value).toBe("0.25000000000000001");
  expect((margin as HTMLInputElement).value).toBe("0.37512345678912345");
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "2");
  await user.selectOptions(preset, "balanced");
  expect((screen.getByRole("textbox", { name: "重排權重 w" }) as HTMLInputElement).value).toBe("0.25");
  expect((screen.getByRole("textbox", { name: "替換門檻 τ" }) as HTMLInputElement).value).toBe("2");
  expect((preset as HTMLSelectElement).value).toBe("balanced");
  expect((screen.getByRole("combobox", { name: "D512 模式" }) as HTMLSelectElement).value).toBe("2");
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "1");
  expect((screen.getByRole("textbox", { name: "重排權重 w" }) as HTMLInputElement).value).toBe("0.25000000000000001");
  expect((screen.getByRole("textbox", { name: "替換門檻 τ" }) as HTMLInputElement).value).toBe("0.37512345678912345");
});

test("zero is valid, invalid drafts block apply and confirm, and correction re-enables them", async () => {
  const user = await openD512();
  const margin = screen.getByRole("textbox", { name: "替換門檻 τ" });
  const apply = screen.getByRole("button", { name: "套用" });
  const confirm = screen.getByRole("button", { name: "確定" });
  await user.clear(margin);
  await user.type(margin, "-0.1");
  expect(margin.getAttribute("aria-invalid")).toBe("true");
  expect((apply as HTMLButtonElement).disabled).toBe(true);
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  await user.clear(margin);
  await user.type(margin, "0");
  expect((margin as HTMLInputElement).value).toBe("0");
  expect(margin.getAttribute("aria-invalid")).not.toBe("true");
  expect((apply as HTMLButtonElement).disabled).toBe(false);
});

test("turning mode off disables presets and numeric fields while retaining the draft", async () => {
  const user = await openD512();
  const weight = screen.getByRole("textbox", { name: "重排權重 w" });
  const mode = screen.getByRole("combobox", { name: "D512 模式" });
  await user.clear(weight);
  await user.type(weight, "0.875");
  await user.selectOptions(mode, "0");
  expect((weight as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("textbox", { name: "替換門檻 τ" }) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("combobox", { name: "D512 檔位" }) as HTMLSelectElement).disabled).toBe(true);
  await user.selectOptions(mode, "1");
  expect((weight as HTMLInputElement).value).toBe("0.875");
  expect((weight as HTMLInputElement).disabled).toBe(false);
});

test.each([
  [1, "重排權重 w", "d512_weight"],
  [1, "替換門檻 τ", "d512_margin"],
  [2, "重排權重 w", "d512_suggest_weight"],
  [2, "替換門檻 τ", "d512_suggest_margin"],
] as const)("mode %i invalid %s does not trap saving while off and remains correctable when re-enabled", async (mode, label, key) => {
  loadedConfig.chewing_tsf.d512_mode = mode;
  const user = await openD512();
  const input = screen.getByRole("textbox", { name: label });
  const apply = screen.getByRole("button", { name: "套用" });
  const confirm = screen.getByRole("button", { name: "確定" });
  await user.clear(input);
  await user.type(input, "-0.1");
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "0");
  expect((screen.getByRole("textbox", { name: label }) as HTMLInputElement).disabled).toBe(true);
  expect((apply as HTMLButtonElement).disabled).toBe(false);
  expect((confirm as HTMLButtonElement).disabled).toBe(false);
  expect(invoke.mock.calls.some(([command]) => command === "save_config")).toBe(false);
  await user.click(screen.getByRole("tab", { name: "打字行為" }));
  await user.click(screen.getByRole("checkbox", { name: "使用 Esc 清空編輯區字串" }));
  await user.click(apply);
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...storedConfig,
    chewing_tsf: { ...storedConfig.chewing_tsf, d512_mode: 0, esc_clean_all_buf: true },
  } });
  await user.click(screen.getByRole("tab", { name: "其他設定" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), String(mode));
  const restored = screen.getByRole("textbox", { name: label }) as HTMLInputElement;
  expect(restored.value).toBe("-0.1");
  expect((apply as HTMLButtonElement).disabled).toBe(true);
  await user.clear(restored);
  await user.type(restored, "0.625");
  expect((confirm as HTMLButtonElement).disabled).toBe(false);
  await user.click(apply);
  expect(invoke).toHaveBeenLastCalledWith("save_config", { config: {
    ...storedConfig,
    chewing_tsf: { ...storedConfig.chewing_tsf, d512_mode: mode, [key]: 0.625, esc_clean_all_buf: true },
  } });
});

test("switching tabs retains the draft and manually restoring values derives balanced", async () => {
  const user = await openD512();
  const weight = screen.getByRole("textbox", { name: "重排權重 w" });
  await user.clear(weight);
  await user.type(weight, "0.5");
  await user.click(screen.getByRole("tab", { name: "打字行為" }));
  await user.click(screen.getByRole("tab", { name: "其他設定" }));
  const restoredWeight = screen.getByRole("textbox", { name: "重排權重 w" });
  expect((restoredWeight as HTMLInputElement).value).toBe("0.5");
  await user.clear(restoredWeight);
  await user.type(restoredWeight, "0.2500");
  expect((screen.getByRole("combobox", { name: "D512 檔位" }) as HTMLSelectElement).value).toBe("balanced");
});

test("save sends edited values and raw mode 2 through the common config fields", async () => {
  const user = await openD512();
  const weight = screen.getByRole("textbox", { name: "重排權重 w" });
  await user.clear(weight);
  await user.type(weight, "0.625");
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "2");
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf, d512_mode: 2, d512_weight: 0.625 },
  } });
});

test("an invalid draft remains explained after switching away from its settings page", async () => {
  const user = await openD512();
  await user.clear(screen.getByRole("textbox", { name: "重排權重 w" }));
  await user.click(screen.getByRole("tab", { name: "打字行為" }));
  expect(screen.getByRole("alert").textContent).toContain("其他設定");
  expect((screen.getByRole("button", { name: "套用" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "取消" }) as HTMLButtonElement).disabled).toBe(false);
});

test("loading shared settings preserves suggestion mode and custom numeric values", async () => {
  loadedConfig.chewing_tsf.d512_mode = 2;
  loadedConfig.chewing_tsf.d512_suggest_weight = 0.375;
  loadedConfig.chewing_tsf.d512_suggest_margin = 0.125;
  await openD512();
  expect((screen.getByRole("combobox", { name: "D512 模式" }) as HTMLSelectElement).value).toBe("2");
  expect((screen.getByRole("textbox", { name: "重排權重 w" }) as HTMLInputElement).value).toBe("0.375");
  expect((screen.getByRole("textbox", { name: "替換門檻 τ" }) as HTMLInputElement).value).toBe("0.125");
  expect((screen.getByRole("combobox", { name: "D512 檔位" }) as HTMLSelectElement).value).toBe("custom");
});

test("import replaces the draft with the imported shared settings", async () => {
  const user = await openD512();
  await user.clear(screen.getByRole("textbox", { name: "重排權重 w" }));
  importedConfig.chewing_tsf.d512_mode = 2;
  importedConfig.chewing_tsf.d512_weight = 0.75;
  importedConfig.chewing_tsf.d512_suggest_weight = 0.875;
  importedConfig.chewing_tsf.d512_suggestion_accept_key = 1;
  importedConfig.chewing_tsf.d512_log_calibration = 1;
  await act(async () => { await listeners.get("import")!(); });
  expect((screen.getByRole("combobox", { name: "D512 模式" }) as HTMLSelectElement).value).toBe("2");
  expect((screen.getByRole("textbox", { name: "重排權重 w" }) as HTMLInputElement).value).toBe("0.875");
  expect((screen.getByRole("combobox", { name: "接受建議的按鍵" }) as HTMLSelectElement).value).toBe("1");
  expect((screen.getByRole("checkbox", { name: "記錄 D512 校準資料" }) as HTMLInputElement).checked).toBe(true);
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "1");
  expect((screen.getByRole("textbox", { name: "重排權重 w" }) as HTMLInputElement).value).toBe("0.75");
  expect((screen.getByRole("button", { name: "套用" }) as HTMLButtonElement).disabled).toBe(false);
});

test("export includes current unsaved D512 edits at f64 precision", async () => {
  const user = await openD512();
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "2");
  await user.selectOptions(screen.getByRole("combobox", { name: "接受建議的按鍵" }), "2");
  await user.click(screen.getByRole("checkbox", { name: "記錄 D512 校準資料" }));
  const margin = screen.getByRole("textbox", { name: "替換門檻 τ" });
  await user.clear(margin);
  await user.type(margin, "0.12345678901234566");
  await act(async () => { await listeners.get("export")!(); });
  expect(invoke).toHaveBeenCalledWith("export_config", { path: "/synthetic/export.toml", config: {
    ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf, d512_mode: 2,
      d512_suggestion_accept_key: 2, d512_suggest_margin: 0.12345678901234566, d512_log_calibration: 1 },
  } });
});

test("invalid D512 edits cannot be exported", async () => {
  const user = await openD512();
  await user.clear(screen.getByRole("textbox", { name: "重排權重 w" }));
  await act(async () => { await listeners.get("export")!(); });
  expect(invoke.mock.calls.some(([command]) => command === "export_config")).toBe(false);
  expect(message).toHaveBeenCalled();
});

test.each([1, 2] as const)("editing both pairs from mode %i keeps the other pair independent through save and export", async (mode) => {
  loadedConfig.chewing_tsf.d512_mode = mode;
  loadedConfig.chewing_tsf.d512_weight = 0.375;
  loadedConfig.chewing_tsf.d512_margin = 0.625;
  loadedConfig.chewing_tsf.d512_suggest_weight = 0.875;
  loadedConfig.chewing_tsf.d512_suggest_margin = 1.25;
  const user = await openD512();
  const modeSelect = screen.getByRole("combobox", { name: "D512 模式" });
  const editPair = async (weight: string, margin: string) => {
    const w = screen.getByRole("textbox", { name: "重排權重 w" });
    const tau = screen.getByRole("textbox", { name: "替換門檻 τ" });
    await user.clear(w);
    await user.type(w, weight);
    await user.clear(tau);
    await user.type(tau, margin);
  };
  expect((screen.getByRole("textbox", { name: "重排權重 w" }) as HTMLInputElement).value).toBe(mode === 1 ? "0.375" : "0.875");
  await editPair("0.5", "0.75");
  await user.selectOptions(modeSelect, mode === 1 ? "2" : "1");
  expect((screen.getByRole("textbox", { name: "重排權重 w" }) as HTMLInputElement).value).toBe(mode === 1 ? "0.875" : "0.375");
  expect((screen.getByRole("textbox", { name: "替換門檻 τ" }) as HTMLInputElement).value).toBe(mode === 1 ? "1.25" : "0.625");
  await editPair("0.625", "1.5");
  await user.selectOptions(modeSelect, String(mode));
  expect((screen.getByRole("textbox", { name: "重排權重 w" }) as HTMLInputElement).value).toBe("0.5");
  expect((screen.getByRole("textbox", { name: "替換門檻 τ" }) as HTMLInputElement).value).toBe("0.75");
  const values = mode === 1
    ? { d512_weight: 0.5, d512_margin: 0.75, d512_suggest_weight: 0.625, d512_suggest_margin: 1.5 }
    : { d512_weight: 0.625, d512_margin: 1.5, d512_suggest_weight: 0.5, d512_suggest_margin: 0.75 };
  const expected = { ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf, d512_mode: mode, ...values } };
  await user.selectOptions(modeSelect, "0");
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...expected, chewing_tsf: { ...expected.chewing_tsf, d512_mode: 0 },
  } });
  await user.selectOptions(modeSelect, String(mode));
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: expected });
  await act(async () => { await listeners.get("export")!(); });
  expect(invoke).toHaveBeenCalledWith("export_config", { path: "/synthetic/export.toml", config: expected });
});

test.each([0, 1])("calibration flag %i loads and can be toggled and saved with D512 off", async (initial) => {
  loadedConfig.chewing_tsf.d512_log_calibration = initial;
  const user = await openD512();
  const log = screen.getByRole("checkbox", { name: "記錄 D512 校準資料" }) as HTMLInputElement;
  expect(log.checked).toBe(initial === 1);
  expect(invoke.mock.calls.some(([command]) => command === "save_config")).toBe(false);
  await user.click(log);
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "0");
  expect(log.disabled).toBe(false);
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: {
    ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf, d512_mode: 0, d512_log_calibration: 1 - initial },
  } });
});

test("off saves the latest successfully applied value instead of reverting it after an invalid edit", async () => {
  const user = await openD512();
  const weight = screen.getByRole("textbox", { name: "重排權重 w" });
  await user.clear(weight);
  await user.type(weight, "0.875");
  await user.click(screen.getByRole("button", { name: "套用" }));
  await user.clear(weight);
  await user.type(weight, "-0.1");
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "0");
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenLastCalledWith("save_config", { config: {
    ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf, d512_mode: 0, d512_weight: 0.875 },
  } });
  await act(async () => { await listeners.get("export")!(); });
  expect(invoke).toHaveBeenCalledWith("export_config", { path: "/synthetic/export.toml", config: {
    ...storedConfig, chewing_tsf: { ...storedConfig.chewing_tsf, d512_mode: 0, d512_weight: 0.875 },
  } });
});

test("an invalid inactive pair still blocks saving while enabled and can be corrected by switching back", async () => {
  const user = await openD512();
  await user.clear(screen.getByRole("textbox", { name: "重排權重 w" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "2");
  expect((screen.getByRole("textbox", { name: "重排權重 w" }) as HTMLInputElement).value).toBe("0.25");
  expect(screen.getByRole("alert")).toBeTruthy();
  expect((screen.getByRole("button", { name: "套用" }) as HTMLButtonElement).disabled).toBe(true);
  await user.selectOptions(screen.getByRole("combobox", { name: "D512 模式" }), "1");
  await user.type(screen.getByRole("textbox", { name: "重排權重 w" }), "0.25");
  expect((screen.getByRole("button", { name: "套用" }) as HTMLButtonElement).disabled).toBe(false);
});
