---
title: D512 設定介面與共用設定
type: reference
date: 2026-10-19
author: Chewing Project Authors
status: implemented
---

<!-- SPDX-FileCopyrightText: 2026 Chewing Project Authors -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# D512 設定介面與共用設定

本分支已實作 D512 的兩模式參數、個人選字偏好、六個檔位、接受鍵與校準紀錄開關。「套用／確定」及匯入／匯出都透過 `chewing_tip_core` 讀寫共用設定；實際校準紀錄的產生與寫檔由 TSF／host 處理。

## 現有結構與放置位置

以主線 `141a10aa9e822ec4511b4bf47c21691c51ad6775` 為基準：前端使用 React、Fluent UI 與 Vite，後端使用 Tauri 2。`src/App.tsx` 管理目前設定與七個分頁，`src/config.tsx` 宣告前端型別；Rust 的 `src-tauri/src/config.rs` 使用 `chewing_tip_core::config::Config` 載入、儲存及匯入／匯出設定。

階段 1 的原樣主線建置通過：以 stable Rust/Cargo 1.99.1 對未修改的上游程式碼執行完整 Windows Release 建置，exit 0。主線 `windows` 依賴的多行 inline table 使用 TOML 1.1；先前為 Cargo 1.91.1 加入的語法相容修正已用 `git revert` 撤回，未改寫歷史。後續的 manifest 差異為 D512 共用設定 git patch、測試依賴及 JSON 精度功能。

文案直接寫在 TSX、Rust 選單及 Tauri 設定中，目前沒有獨立 i18n 函式庫或翻譯目錄。新增文案沿用繁體中文，不為此功能建立另一套翻譯架構。

「D512 句級重排」區塊放在「其他設定」頁，位於自動檢查更新之前；文案及欄位集中在 `src/D512Settings.tsx`。接受鍵選單位於模式下方，紀錄開關放在 D512 區塊最後。沿用既有分頁可避免增加第八個分頁，也能把 D512 模式與既有注音轉換模式區分開來。新增接受鍵前的介面曾用合成 Tauri 邊界在瀏覽器檢查 670 × 750 視窗；目前介面的 Windows 原生 GUI、排版與縮放仍待驗證。

## 控制項與連動

| 欄位 | 顯示與行為 |
| --- | --- |
| D512 模式 | 關閉／自動／僅建議，對應共用契約的 0／1／2。預設為自動。 |
| 接受建議的按鍵 | Tab／Ctrl+Tab／右方向鍵（句尾），對應 0／1／2，預設 Tab。只有僅建議模式可操作，其餘模式保留原值。 |
| 檔位 | 保守／平衡／積極／自訂。由目前模式的 w、τ 推算，不存檔位鍵。 |
| 重排權重 w | 非負、有限數值；兩模式的平衡值都是 0.25。 |
| 替換門檻 τ | 非負、有限數值；自動模式預設 0.5、僅建議模式預設 2。 |
| 個人學習加分 b | 非負、有限數值；自動與僅建議各自保存，兩模式預設都是 2。檔位不改 b。 |
| 記錄 D512 校準資料 | 預設關閉，對應 0／1。D512 關閉時仍可設定，實際紀錄由 TSF／host 決定。 |

自動與僅建議各自保存 w、τ、b，設定頁只顯示目前模式的那一組；切換模式或分頁會保留兩組輸入原文。選擇檔位時，一次帶入目前模式的 w、τ，保留兩組 b。修改 w 或 τ 後重新推算檔位；不吻合任何組合時顯示「自訂」，重新輸入精確的檔位組合時可再次顯示該檔位。選擇「自訂」保留目前數值。這沿用 Mac 唯音 A2.8 的「由數值推算檔位」行為。

關閉模式時顯示自動參數，並停用檔位及三個數值欄，兩組草稿仍保留。此時無效輸入不會阻擋套用／確定或匯出，送出時以已載入或最近成功套用的有效值代替該無效欄位；其他有效修改照常保存。切回原模式後仍可修正無效輸入。成功套用後會更新有效值基準，避免後續關閉模式的保存退回更早的數值。

六個檔位的 τ 沿用 Mac A2.8，w 共用 Windows 的 0.25，兩模式各自預設平衡：

| 模式 | 保守 w／τ | 平衡 w／τ | 積極 w／τ |
| --- | --- | --- | --- |
| 自動 | 0.25／1 | 0.25／0.5 | 0.25／0.2 |
| 僅建議 | 0.25／3 | 0.25／2 | 0.25／1 |

這是目前採用的設定表，後續可依 Windows 日常紀錄微調；先前的離線校準表保留作分析。既有自訂數值會照原值讀取，不因檔位表改動而覆寫。兩模式的個人學習加分 b 都不隨檔位變動。

接受鍵說明為「在僅建議模式中選擇接受鍵。Tab 和 Ctrl+Tab 在沒有建議時不改組字；右方向鍵只在句尾接受。」讀到超出 0–2 的原值時，選單顯示 Tab，但載入不會觸發儲存；停用選單、切換模式或保存其他欄位都保留原值。只有使用者實際選擇接受鍵時才更新該值，未知值的執行期回退由共用 core 處理。

紀錄開關說明為「在本機保存讀音、候選、分數與送出文字。紀錄包含您的個人打字資料，預設關閉。」設定程式只儲存開關，不產生、讀取或匯出校準紀錄。

## 輸入習慣開關

「打字行為」頁沿用既有勾選框與設定流程，新增以下兩個開關，不新增分頁：

| 標籤 | 共用欄位／登錄鍵 | 共用 core 預設 |
| --- | --- | --- |
| ctrl符號輸出(新注音模式) | `ctrl_symbol_new_phonetic`／DWORD `CtrlSymbolNewPhonetic` | 開啟 |
| 組字區游標左右循環 | `cursor_wrap`／DWORD `CursorWrap` | 關閉 |

Ctrl 符號開關放在 Esc 與 Shift 標點選項之間，說明為「組字中按 Ctrl+， 。 ； ' [ ] 輸入，。；、【】」。游標循環開關放在方向鍵選字選項之後，說明為「游標在組字區最右邊時按右方向鍵跳到最左邊，反之亦然」。兩個開關各自保存，切換分頁或修改其他設定不會覆蓋原值。

前端直接顯示載入的布林值，不另外寫預設值；登錄鍵及舊 TOML 缺少欄位時的預設由 `chewing_tip_core` 處理。載入、套用、匯入及匯出均使用同一個 `ChewingTsfConfig`。設定程式只讀寫選項，實際 Ctrl 按鍵分流與組字游標行為由 TSF／引擎實作，須另外在實際輸入環境驗收。

## 個人選字偏好

「打字行為」頁在「自動學習常用詞與新詞」旁加入「使用個人選字偏好」。說明為「記住有效送出的手動選字，依近期偏好直接組字並調整多字詞的候選順序。關閉會保留記錄。」此開關獨立於自動學習；前端直接顯示 core 載入的值，不另寫預設。缺少登錄鍵或舊 TOML 欄位時，由 core 預設開啟。

D512 區塊在 w、τ 後顯示「個人學習加分 b」，自動與僅建議各自保存。b 沿用既有的有限非負數值驗證、關閉模式回退及載入／套用／匯入／匯出流程。設定程式只讀寫選項；偏好記錄、送出確認與實際學習行為由 TSF／引擎處理，須另行驗收。

## 共用設定與數值保存

`src/d512.ts` 在 UI 草稿保留六個數值的原文。模式保留 0／1／2，接受鍵與紀錄開關對應共用 i32 欄位；檔位延續本分支的十進位有效數字比對，避免將編輯中的 `0.25000000000000001` 捨入成平衡檔。

Cargo patch 使用 [ValorVie/windows-chewing-tsf](https://github.com/ValorVie/windows-chewing-tsf) 的 `chewing_tip_core`，並以 [ValorVie/libchewing](https://github.com/ValorVie/libchewing) 提供 core 所需的 `d512` feature；core 的 patch 固定至 `5a2446db1f69202780994a43fb9884de4d9836ec`，引擎 patch 選用 `valor-feature` 分支。clone 此 repo 後，Cargo 會依 `Cargo.lock` 取得共用 core 與引擎，建置時保留 `--locked`。主線 `[dependencies]` 的 Codeberg git 與 `chewing 0.13.0-alpha.2` 需求保持原樣，只以 patch 指向公開 fork；core 使用的 `chewing 0.14.0-alpha.4` 也維持原版本。前端沿用現有 `load_config`、`save_config`、匯入與匯出流程；實際登錄讀寫仍使用共用型別的 `from_reg`／`save_reg`。

共用契約在 `HKCU\Software\ChewingTextService` 保存以下欄位；實際鍵名及預設值的唯一實作留在 TSF：

| 共用欄位 | 登錄鍵 | 格式／預設 |
| --- | --- | --- |
| `d512_mode` | `D512Mode` | DWORD／1 |
| `d512_suggestion_accept_key` | `D512SuggestionAcceptKey` | DWORD／0 |
| `d512_log_calibration` | `D512LogCalibration` | DWORD／0 |
| `d512_weight`／`d512_margin` | `D512Weight`／`D512Margin` | REG_SZ／0.25、0.5 |
| `d512_suggest_weight`／`d512_suggest_margin` | `D512SuggestWeight`／`D512SuggestMargin` | REG_SZ／0.25、2 |
| `use_personal_candidate_preference` | `UsePersonalCandidatePreference` | DWORD／1 |
| `d512_personal_bonus`／`d512_suggest_personal_bonus` | `D512PersonalBonus`／`D512SuggestPersonalBonus` | REG_SZ／2、2 |

舊設定檔缺少新欄位時，由 core 補上預設值；原有自動參數保持原值。接受鍵的未知 i32 原值仍可往返，不因顯示回退而改寫。

數值欄位使用可保留編輯原文的輸入框，避免 `parseInt` 截去小數，或真假值回退把合法的 0 換成預設值。空白、負數、非數值、NaN、Infinity、溢位、非零值下溢成 0 及無效尾字元會顯示錯誤。模式開啟時，任一組無效都會阻擋「套用／確定」與匯出，切換模式及分頁不丟失錯誤；關閉時依上述有效值回退規則保存。Rust 在儲存或匯出前及匯入後，一律驗證模式與六個數值的有限非負範圍。

共用型別的權重、門檻與加分為 f64，儲存時從編輯原文轉成 JavaScript Number，經 JSON 傳給 Rust；不使用固定小數位格式化。`serde_json` 開啟 `float_roundtrip`，避免 JSON 解析造成額外的 1 ULP 誤差；共用 core 以 f64 的十進位往返表示寫入 REG_SZ。這保留共用 f64 值的精度，不保證任意長十進位原文在重新載入後逐字相同。

## 驗證與人工驗收界線

原專案沒有前端測試入口，本分支新增 `npm test`（Vitest、jsdom、React Testing Library）及 `tests/`。實際 App 與 Fluent UI 控制項參與測試，只替換 Tauri 邊界並使用合成資料。已保留 UI 缺失及數值／檔位的 RED，再驗證 GREEN；`tsc` 或 Vite 建置不計入行為測試數。

測試分別驗證以下邊界；建置、測試與實際安裝驗收分開記錄：

1. 前端：兩模式各自顯示／編輯及六個檔位、數值原文保留、接受鍵停用及未知值保留、紀錄開關、關閉後保存有效值與重新修正無效輸入，以及載入／儲存／匯入／匯出。
2. Rust：兩組參數、紀錄開關及接受鍵的 JSON／隔離登錄／TOML 往返；舊 TOML 的新欄位預設與既有值保留；六個數值均驗證有限非負範圍。另保留相鄰 f64、極端有限值及固定種子的 1,024 個正 f64 JSON 案例。
3. 登錄測試沿用 core 的方式，用 `RegOverridePredefKey` 將測試程序的 HKCU 轉到暫存子樹，結束後還原映射並刪除；不改使用者的實際輸入法設定。TOML 測試只寫入暫存檔。
4. PC 以 `npm run tauri -- build --no-bundle --ci --target x86_64-pc-windows-msvc -- --locked` 建出 `ChewingPreferences.exe`；不安裝、不註冊。實際輸入法設定生效、Windows 原生 GUI、縮放、安裝與回復仍需另外驗收。

輸入習慣開關另涵蓋四組布林組合的前端載入、各自切換與套用、其他分頁保存，以及匯入後編輯與匯出；Rust 驗證共用預設、舊 TOML／缺少登錄鍵時的預設、JSON／隔離登錄／TOML 往返及修改其他設定後保留兩個開關。

個人選字偏好另涵蓋開關的載入／切換、兩模式 b 獨立編輯、所有檔位保留 b、跨分頁保存、匯入／匯出、0 與相鄰 f64 精度、隱藏草稿錯誤及關閉後使用最近成功套用值。Rust 驗證三個欄位的共用預設、舊檔相容、JSON／隔離登錄／TOML 往返及有限非負範圍。

## 依據與取捨

- 成熟實作：本專案的 Fluent UI 欄位及 Tauri 命令、Mac A2.8 的分模式參數與檔位 τ，以及 `VwrSettingsPaneCandidates.swift` 的接受鍵可操作條件、參數停用條件與紀錄開關位置。Windows 保留 w=0.25、有限非負範圍及十進位精確推算；個人偏好標籤與 b 標籤沿用 Mac，說明依 Windows 的學習功能調整。
- 官方文件：[React 狀態結構](https://react.dev/learn/choosing-the-state-structure) 建議從既有資料推算可計算的顯示值；因此檔位不另存。[Tauri Windows 前置條件](https://v2.tauri.app/start/prerequisites/#windows) 說明 Windows 建置使用 C++ Build Tools、Rust 與 WebView2。
- 隔離測試：[RegOverridePredefKey](https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-regoverridepredefkey) 的映射僅影響呼叫程序；[serde_json 功能列表](https://docs.rs/crate/serde_json/latest/features) 記錄 `float_roundtrip`。測試曾捕捉 `1.66530964545728732` 解析後少 1 ULP，不能以普通小數通過就推論所有 f64 都能無損往返。
- 工具鏈依據：[Rust 1.94 發布說明](https://blog.rust-lang.org/2026/03/05/Rust-1.94.0/#toml-11-support-in-cargo) 記錄 Cargo 自該版本起支援多行 inline table；此分支的 Windows 驗證使用 stable 1.99.1。
- 可靠文獻：[Goldberg, What Every Computer Scientist Should Know About Floating-Point Arithmetic](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html) 說明十進位與二進位浮點數轉換的誤差；據此將共用型別的往返精度列為獨立驗收項。文獻解釋風險，實際保存流程仍須用本專案的測試驗證。

本文件記錄 C3 的 UI 與設定邊界；自動化登錄往返不能代替使用者的安裝、日常輸入及實際校準紀錄驗收。
