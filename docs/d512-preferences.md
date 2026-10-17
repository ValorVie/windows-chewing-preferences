---
title: D512 設定介面與待接線項目
type: plan
date: 2026-10-17
author: Chewing Project Authors
status: ui-preview
---

<!-- SPDX-FileCopyrightText: 2026 Chewing Project Authors -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# D512 設定介面與待接線項目

本分支已實作 D512 控制項、數值驗證與檔位連動，目前只保留視窗內的草稿，不讀寫登錄或匯入／匯出 D512 設定。畫面明示尚未接上儲存；「套用／確定」仍只儲存既有設定。取得 TSF 共用設定 commit 且經主控通知後，才接 path patch 與讀寫；引擎尚未提供檔位表時，平衡檔使用預設值，其餘兩檔保留「待校準」。

## 現有結構與放置位置

以主線 `141a10aa9e822ec4511b4bf47c21691c51ad6775` 為基準：前端使用 React、Fluent UI 與 Vite，後端使用 Tauri 2。`src/App.tsx` 管理目前設定與七個分頁，`src/config.tsx` 宣告前端型別；Rust 的 `src-tauri/src/config.rs` 使用 `chewing_tip_core::config::Config` 載入、儲存及匯入／匯出設定。

原樣主線建置通過：以 stable Rust/Cargo 1.99.1 執行完整 Windows Release 建置，exit 0。主線 `windows` 依賴的多行 inline table 使用 TOML 1.1；先前為 Cargo 1.91.1 加入的語法相容修正已用 `git revert` 撤回，manifest 恢復上游原文，未改寫歷史。

文案直接寫在 TSX、Rust 選單及 Tauri 設定中，目前沒有獨立 i18n 函式庫或翻譯目錄。新增文案沿用繁體中文，不為此功能建立另一套翻譯架構。

「D512 句級重排」區塊放在「其他設定」頁，位於自動檢查更新之前；文案及欄位集中在 `src/D512Settings.tsx`。該頁原本只有更新選項，能容納模式、檔位及兩個數值欄位；「打字行為」已有兩欄控制項與進階設定。沿用既有分頁可避免增加第八個分頁，也能把 D512 模式與既有注音轉換模式區分開來。已用合成 Tauri 邊界在瀏覽器檢查 670 × 750 視窗，實際 PC GUI 與縮放仍待驗證。

## 控制項與連動

| 欄位 | 顯示與行為 |
| --- | --- |
| D512 模式 | 關閉／自動／僅建議，對應共用契約的 0／1／2。預設為自動。 |
| 僅建議說明 | 在選項及區塊說明中標明「尚未支援，暫時等同自動」。待 TSF 真正支援後才移除。 |
| 檔位 | 保守／平衡／積極／自訂。由目前 w、τ 與引擎檔位表推算，不存檔位鍵。 |
| 重排權重 w | 非負、有限數值；初始平衡值為 0.25。 |
| 替換門檻 τ | 非負、有限數值；初始平衡值為 0.25。 |

選擇已校準的檔位時，一次帶入 w、τ。修改任一數值後重新推算檔位；不吻合任何已校準組合時顯示「自訂」，重新輸入精確的檔位組合時可再次顯示該檔位。選擇「自訂」保留目前數值。這沿用 Mac 唯音 A2.8 的「由數值推算檔位」行為，避免儲存兩套互相衝突的狀態。

關閉模式時保留 w、τ，停用檔位與數值控制項；重新開啟時恢復原值。第二階段先保留模式 2 的選擇，實際暫時等同自動由 TSF 處理，不由前端偷偷改存模式 1。

引擎尚未提供校準表時，僅平衡檔可帶入 `(w, τ) = (0.25, 0.25)`；保守與積極顯示「待校準」並停用。校準表由引擎分支的 `docs/d512.md` 提供，取得後照表接入。Mac 的 w、τ、個人偏好加分 b 不可直接搬到 libchewing；Windows 本次不做 b。

## 共用設定與數值保存

目前 `src/d512.ts` 只在 UI 草稿使用 `D512Mode`、`D512Weight`、`D512Margin` 及契約預設值，數值保留原文字串；草稿不加入傳給既有 Rust 命令的設定物件。檔位以十進位有效數字比較，避免將 `0.25000000000000001` 捨入成平衡檔。

待接線時以 Cargo path patch 使用同一工作區的 TSF `feature/d512` 之 `chewing_tip_core`。C3 只使用其共用欄位與 `from_reg`／`save_reg`，不另外實作登錄存取器。前端型別依 C2 的實際序列化欄位更新，仍走現有 `load_config`、`save_config`、匯入與匯出流程。

共用契約在 `HKCU\Software\ChewingTextService` 保存 `D512Mode`（DWORD）及 `D512Weight`、`D512Margin`（REG_SZ 十進位字串）。這裡記錄契約用途，實際鍵名及預設值的唯一實作留在 TSF。

數值欄位使用可保留編輯中原文的輸入框，避免沿用現有 `setNumberConfig` 的 `parseInt` 及真假值回退：前者會截去小數，後者可能把合法的 0 換成預設值。空白、負數、非數值、NaN、Infinity、溢位、非零值下溢成 0 及無效尾字元會顯示欄位錯誤並阻擋「套用／確定」，跨分頁也保留錯誤說明；不可靜默截斷或重設使用者輸入。D512 匯出尚未接線，後續接線時須同步驗證。

不使用固定小數位格式化。跨前端、Rust 與 REG_SZ 必須保留 C2 共用數值型別的往返精度；具體序列化方式待讀到 C2 的型別後確定。若共用型別只有 f64，驗收須區分「f64 值往返不變」與「任意長十進位原文完全保留」，不得將前者宣稱為後者；若契約要求後者，先回報主控協調共用型別。

## 第二階段的驗證順序

原專案沒有前端測試入口，本分支新增 `npm test`（Vitest、jsdom、React Testing Library）及 `tests/`。實際 App 與 Fluent UI 控制項參與測試，只替換 Tauri 邊界並使用合成資料。已保留 UI 缺失及數值／檔位的 RED，再驗證 GREEN；`tsc` 或 Vite 建置不計入行為測試數。

已驗證 UI 與純數值邏輯；以下接線驗證仍待共用 API：

1. 前端已覆蓋：檔位帶值、手動編輯後推算自訂、回填檔位值、待校準檔位不能選、模式 2 提示、關閉後保留值、跨分頁草稿與錯誤說明。
2. 待接前端與 Rust 邊界：0、小數及需要足夠有效位數的值可往返；負數、空字串、NaN、Infinity、溢位與尾隨垃圾不能儲存。
3. Rust：透過共用型別驗證預設、序列化與讀寫往返；登錄測試需使用共用 API 支援的隔離測試位置，不能改使用者的實際輸入法設定。若共用 API 沒有隔離入口，回報主控請 C2 提供。
4. 重新載入、匯入／匯出與取消時的行為保持一致；最後在 PC 建出 `ChewingPreferences.exe`，不安裝、不註冊。

## 依據與取捨

- 成熟實作：本專案上述檔案的分頁、Fluent UI 欄位及 Tauri 設定命令；Mac 唯音 `D512RerankPreset.swift` 的 `matching` 與 `VwrSettingsPaneCocoaCandidates.swift` 的 `refresh`／`presetDidSet`。只參照連動方式，不移植其閾值、加分 b 或 0…10 上限。
- 官方文件：[React 狀態結構](https://react.dev/learn/choosing-the-state-structure) 建議從既有資料推算可計算的顯示值；因此檔位不另存。[Tauri Windows 前置條件](https://v2.tauri.app/start/prerequisites/#windows) 說明 Windows 建置使用 C++ Build Tools、Rust 與 WebView2。
- 工具鏈依據：[Rust 1.94 發布說明](https://blog.rust-lang.org/2026/03/05/Rust-1.94.0/#toml-11-support-in-cargo) 記錄 Cargo 自該版本起支援多行 inline table。使用較舊 Cargo 時改用標準表格語法，可避免為語法升級工具鏈。
- 可靠文獻：[Goldberg, What Every Computer Scientist Should Know About Floating-Point Arithmetic](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html) 說明十進位與二進位浮點數轉換的誤差；據此將共用型別的往返精度列為獨立驗收項。這篇文獻不能證明目前尚未實作的保存流程已正確。

本文件記錄 C3 的 UI 行為及待接線項目，不取代引擎檔位表或 TSF 共用設定契約；目前沒有 D512 登錄往返或安裝驗收結果。
