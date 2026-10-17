// SPDX-FileCopyrightText: 2026 Chewing Project Authors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("@tauri-apps/plugin-process", () => ({ exit: vi.fn() }));

// Synthetic data only. The backend boundary is mocked; all controls are real.
const storedConfig = {
  chewing_tsf: {
    switch_lang_with_shift: false, shift_key_sensitivity: 0,
    enable_fullwidth_toggle_key: false, enable_caps_lock: false,
    lock_chinese_on_caps_lock: false, show_notification: false,
    enable_auto_learn: false, esc_clean_all_buf: false,
    full_shape_symbols: false, upper_case_with_shift: false,
    add_phrase_forward: false, phrase_choice_rearward: false,
    easy_symbols_with_shift: false, easy_symbols_with_shift_ctrl: false,
    cursor_cand_list: false, sort_candidates_by_frequency: false,
    show_cand_with_space_key: false, advance_after_selection: false,
    default_full_space: false, default_english: false, output_simp_chinese: false,
    sel_key_type: 0, conv_engine: 1, cand_per_row: 5, cand_per_page: 10,
    font_size: 16, font_family: "Test Font", font_fg_color: "#000000",
    font_bg_color: "#ffffff", font_highlight_fg_color: "#ffffff",
    font_highlight_bg_color: "#000000", font_number_fg_color: "#000000",
    cand_list_border_color: "#000000", notify_fg_color: "#000000",
    notify_bg_color: "#ffffff", notify_border_color: "#000000",
    keyboard_layout: 0, simulate_english_layout: 0,
    sync_lang_mode_openclose: false,
    keybind: [{ key: "A", action: "text", param: "synthetic" }],
    auto_check_update_channel: "stable", update_info_url: "https://example.invalid/",
  },
  symbols_dat: "", swkb_dat: "",
};

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async (command: string) => {
    if (command === "load_config") return structuredClone(storedConfig);
    if (command === "get_system_fonts") return [];
    if (command === "save_config") return;
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

test("shows contract defaults, unavailable presets, and the unsaved preview notice", async () => {
  await openD512();
  expect((screen.getByRole("combobox", { name: "D512 模式" }) as HTMLSelectElement).value).toBe("1");
  expect((screen.getByRole("combobox", { name: "D512 檔位" }) as HTMLSelectElement).value).toBe("balanced");
  expect((screen.getByRole("textbox", { name: "重排權重 w" }) as HTMLInputElement).value).toBe("0.25");
  expect((screen.getByRole("textbox", { name: "替換門檻 τ" }) as HTMLInputElement).value).toBe("0.25");
  expect((screen.getByRole("option", { name: "保守（待校準）" }) as HTMLOptionElement).disabled).toBe(true);
  expect((screen.getByRole("option", { name: "積極（待校準）" }) as HTMLOptionElement).disabled).toBe(true);
  expect(screen.getByText(/尚未接上儲存/)).toBeTruthy();
});

test("retains mode 2 and explains that suggestion mode currently behaves as automatic", async () => {
  const user = await openD512();
  const mode = screen.getByRole("combobox", { name: "D512 模式" });
  await user.selectOptions(mode, "2");
  expect((mode as HTMLSelectElement).value).toBe("2");
  expect(screen.getByText("尚未支援，暫時等同自動")).toBeTruthy();
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
  expect((weight as HTMLInputElement).value).toBe("0.25");
  expect((margin as HTMLInputElement).value).toBe("0.25");
  expect((preset as HTMLSelectElement).value).toBe("balanced");
  expect((screen.getByRole("combobox", { name: "D512 模式" }) as HTMLSelectElement).value).toBe("2");
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

test("turning mode off disables controls while preserving the edited values", async () => {
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

test("preview edits do not add D512 fields to existing backend save payloads", async () => {
  const user = await openD512();
  const weight = screen.getByRole("textbox", { name: "重排權重 w" });
  await user.clear(weight);
  await user.type(weight, "0.625");
  await user.click(screen.getByRole("button", { name: "套用" }));
  expect(invoke).toHaveBeenCalledWith("save_config", { config: storedConfig });
});

test("an invalid draft remains explained after switching away from its settings page", async () => {
  const user = await openD512();
  await user.clear(screen.getByRole("textbox", { name: "重排權重 w" }));
  await user.click(screen.getByRole("tab", { name: "打字行為" }));
  expect(screen.getByRole("alert").textContent).toContain("其他設定");
  expect((screen.getByRole("button", { name: "套用" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "取消" }) as HTMLButtonElement).disabled).toBe(false);
});
