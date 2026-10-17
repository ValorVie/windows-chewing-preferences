---
title: D512 設定介面與共用設定
type: reference
date: 2026-10-18
author: Chewing Project Authors
status: implemented
---

<!-- SPDX-FileCopyrightText: 2026 Chewing Project Authors -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# D512 設定介面與共用設定

本分支已實作 D512 控制項、數值驗證、三組校準檔位及共用設定讀寫。「套用／確定」透過 `chewing_tip_core` 儲存模式、接受鍵、權重與門檻，匯入／匯出也包含這四個欄位。

## 現有結構與放置位置

以主線 `141a10aa9e822ec4511b4bf47c21691c51ad6775` 為基準：前端使用 React、Fluent UI 與 Vite，後端使用 Tauri 2。`src/App.tsx` 管理目前設定與七個分頁，`src/config.tsx` 宣告前端型別；Rust 的 `src-tauri/src/config.rs` 使用 `chewing_tip_core::config::Config` 載入、儲存及匯入／匯出設定。

階段 1 的原樣主線建置通過：以 stable Rust/Cargo 1.99.1 對未修改的上游程式碼執行完整 Windows Release 建置，exit 0。主線 `windows` 依賴的多行 inline table 使用 TOML 1.1；先前為 Cargo 1.91.1 加入的語法相容修正已用 `git revert` 撤回，未改寫歷史。後續的 manifest 差異為 D512 共用設定 path patch、測試依賴及 JSON 精度功能。

文案直接寫在 TSX、Rust 選單及 Tauri 設定中，目前沒有獨立 i18n 函式庫或翻譯目錄。新增文案沿用繁體中文，不為此功能建立另一套翻譯架構。

「D512 句級重排」區塊放在「其他設定」頁，位於自動檢查更新之前；文案及欄位集中在 `src/D512Settings.tsx`。接受鍵選單位於模式下方。沿用既有分頁可避免增加第八個分頁，也能把 D512 模式與既有注音轉換模式區分開來。新增接受鍵前的介面曾用合成 Tauri 邊界在瀏覽器檢查 670 × 750 視窗；本輪新介面的 Windows 原生 GUI、排版與縮放仍待驗證。

## 控制項與連動

| 欄位 | 顯示與行為 |
| --- | --- |
| D512 模式 | 關閉／自動／僅建議，對應共用契約的 0／1／2。預設為自動。 |
| 僅建議說明 | 在選項及區塊說明中標明「尚未支援，暫時等同自動」。待 TSF 真正支援後才移除。 |
| 接受建議的按鍵 | Tab／Ctrl+Tab／右方向鍵（句尾），對應 0／1／2，預設 Tab。只有僅建議模式可操作，其餘模式保留原值。 |
| 檔位 | 保守／平衡／積極／自訂。由目前 w、τ 與引擎檔位表推算，不存檔位鍵。 |
| 重排權重 w | 非負、有限數值；初始平衡值為 0.25。 |
| 替換門檻 τ | 非負、有限數值；初始平衡值為 0.25。 |

選擇已校準的檔位時，一次帶入 w、τ。修改任一數值後重新推算檔位；不吻合任何已校準組合時顯示「自訂」，重新輸入精確的檔位組合時可再次顯示該檔位。選擇「自訂」保留目前數值。這沿用 Mac 唯音 A2.8 的「由數值推算檔位」行為，避免儲存兩套互相衝突的狀態。

關閉模式時保留 w、τ 並停用檔位；數值欄仍可編輯，讓使用者直接修正無效草稿。無效值仍會阻擋套用／確定與匯出，修正後可保存模式 0 及其他分頁的設定。第二階段先保留模式 2 的選擇，實際暫時等同自動由 TSF 處理，不由前端偷偷改存模式 1。

三組檔位使用引擎 `docs/d512.md` 的校準表：

| 檔位 | w | τ |
| --- | --- | --- |
| 保守 | 0.25 | 0.80 |
| 平衡 | 0.25 | 0.25 |
| 積極 | 0.15 | 0.10 |

這是離線原廠詞庫的校準結果，不代表 Windows IPC 或真人使用驗收。Mac 的 w、τ、個人偏好加分 b 不可直接搬到 libchewing；Windows 本次不做 b。

接受鍵說明為「在僅建議模式中選擇接受鍵。Tab 和 Ctrl+Tab 在沒有建議時不改組字；右方向鍵只在句尾接受。」讀到超出 0–2 的原值時，選單顯示 Tab，但載入不會觸發儲存；停用選單、切換模式或保存其他欄位都保留原值。只有使用者實際選擇接受鍵時才更新該值，未知值的執行期回退由共用 core 處理。

## 共用設定與數值保存

`src/d512.ts` 在 UI 草稿保留數值原文；載入、儲存及匯入／匯出時，對應共用設定的 `d512_mode`、`d512_suggestion_accept_key`、`d512_weight`、`d512_margin`。模式保留原樣的 0／1／2；只有 TSF 執行引擎時處理僅建議暫時等同自動的行為。檔位以十進位有效數字比較，避免在編輯時將 `0.25000000000000001` 捨入成平衡檔。

Cargo path patch 使用 repo 內忽略追蹤的 `.c3-deps/windows-chewing-tsf/crates/chewing_tip_core`，並以 `.c3-deps/libchewing` 提供 core 所需的 `d512` feature。建置前用 `git archive` 從指定 commit 建立這兩份快照；實際版本與封存檔雜湊記錄在每次交接，避免納入其他線未提交的修改。preferences 直接依賴的舊版 chewing 維持不變。前端沿用現有 `load_config`、`save_config`、匯入與匯出流程；C3 不另外實作登錄存取器，實際讀寫仍使用共用型別的 `from_reg`／`save_reg`。

共用契約在 `HKCU\Software\ChewingTextService` 保存 `D512Mode`、`D512SuggestionAcceptKey`（DWORD）及 `D512Weight`、`D512Margin`（REG_SZ 十進位字串）。接受鍵的共用型別為 i32；未知原值可往返，不因顯示回退而改寫。舊設定檔缺少接受鍵時，core 預設為 0。這裡記錄契約用途，實際鍵名及預設值的唯一實作留在 TSF。

數值欄位使用可保留編輯中原文的輸入框，避免沿用現有 `setNumberConfig` 的 `parseInt` 及真假值回退：前者會截去小數，後者可能把合法的 0 換成預設值。空白、負數、非數值、NaN、Infinity、溢位、非零值下溢成 0 及無效尾字元會顯示欄位錯誤並阻擋「套用／確定」與匯出，跨分頁也保留錯誤說明。Rust 端在儲存或匯出前另驗證模式與有限非負數值；匯入後也先驗證，才交給前端。

共用型別的權重與門檻為 f64，儲存時從編輯原文轉成 JavaScript Number，經 JSON 傳給 Rust；不使用固定小數位格式化。`serde_json` 開啟 `float_roundtrip`，避免 JSON 解析造成額外的 1 ULP 誤差；共用 core 以 f64 的十進位往返表示寫入 REG_SZ。這保留共用 f64 值的精度，不保證任意長十進位原文在重新載入後逐字相同。

## 驗證與人工驗收界線

原專案沒有前端測試入口，本分支新增 `npm test`（Vitest、jsdom、React Testing Library）及 `tests/`。實際 App 與 Fluent UI 控制項參與測試，只替換 Tauri 邊界並使用合成資料。已保留 UI 缺失及數值／檔位的 RED，再驗證 GREEN；`tsc` 或 Vite 建置不計入行為測試數。

測試分別驗證以下邊界；建置、測試與實際安裝驗收分開記錄：

1. 前端：三組檔位帶值、手動編輯後推算自訂、回填檔位值、接受鍵只有模式 2 可操作、停用及未知值的保留、關閉後修正無效數值、跨分頁草稿與錯誤說明，以及載入／儲存／匯入／匯出的實際共用欄位。
2. Rust：模式 0／1／2、接受鍵 0／1／2 與未知 i32 原值的 JSON／登錄／TOML 往返；舊 TOML 缺欄位時使用 Tab。數值包含 0、小數、相鄰 f64 與極端有限值；另以固定種子的 1,024 個正 f64 值檢查 JSON 往返。Rust 匯入／匯出測試也檢查無效資料與負數的拒絕。
3. 登錄測試沿用 core 的方式，用 `RegOverridePredefKey` 將測試程序的 HKCU 轉到暫存子樹，結束後還原映射並刪除；不改使用者的實際輸入法設定。TOML 測試只寫入暫存檔。
4. PC 以 `npm run tauri -- build --no-bundle --ci --target x86_64-pc-windows-msvc -- --locked` 建出 `ChewingPreferences.exe`；不安裝、不註冊。實際輸入法設定生效、Windows 原生 GUI、縮放、安裝與回復仍需另外驗收。

## 依據與取捨

- 成熟實作：本專案上述檔案的分頁、Fluent UI 欄位及 Tauri 設定命令；Mac 唯音 `D512RerankPreset.swift` 的 `matching` 與 `VwrSettingsPaneCocoaCandidates.swift` 的 `refresh`／`presetDidSet`。只參照連動方式，不移植其閾值、加分 b 或 0…10 上限。
- 官方文件：[React 狀態結構](https://react.dev/learn/choosing-the-state-structure) 建議從既有資料推算可計算的顯示值；因此檔位不另存。[Tauri Windows 前置條件](https://v2.tauri.app/start/prerequisites/#windows) 說明 Windows 建置使用 C++ Build Tools、Rust 與 WebView2。
- 隔離測試：[RegOverridePredefKey](https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-regoverridepredefkey) 的映射僅影響呼叫程序；[serde_json 功能列表](https://docs.rs/crate/serde_json/latest/features) 記錄 `float_roundtrip`。測試曾捕捉 `1.66530964545728732` 解析後少 1 ULP，不能以普通小數通過就推論所有 f64 都能無損往返。
- 工具鏈依據：[Rust 1.94 發布說明](https://blog.rust-lang.org/2026/03/05/Rust-1.94.0/#toml-11-support-in-cargo) 記錄 Cargo 自該版本起支援多行 inline table；此分支的 Windows 驗證使用 stable 1.99.1。
- 可靠文獻：[Goldberg, What Every Computer Scientist Should Know About Floating-Point Arithmetic](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html) 說明十進位與二進位浮點數轉換的誤差；據此將共用型別的往返精度列為獨立驗收項。文獻解釋風險，實際保存流程仍須用本專案的測試驗證。

本文件記錄 C3 的 UI 與設定邊界，不取代引擎檔位表或 TSF 共用設定契約；自動化登錄往返不能代替使用者的安裝與日常輸入驗收。
