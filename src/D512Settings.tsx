// SPDX-FileCopyrightText: 2026 Chewing Project Authors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Checkbox, Field, Input, Select } from "@fluentui/react-components";
import {
  D512_PRESETS,
  d512DraftHasErrors,
  d512Preset,
  d512ValueError,
  type D512Draft,
  type D512Mode,
} from "./d512";

type Props = {
  draft: D512Draft;
  onChange: (draft: D512Draft) => void;
};

export default function D512Settings({ draft, onChange }: Props) {
  const disabled = draft.D512Mode === 0;
  const suggestion = draft.D512Mode === 2;
  const presets = D512_PRESETS[suggestion ? "suggestion" : "automatic"];
  const weightKey = suggestion ? "D512SuggestWeight" : "D512Weight";
  const marginKey = suggestion ? "D512SuggestMargin" : "D512Margin";
  return (
    <section aria-labelledby="d512-heading">
      <h2 id="d512-heading">D512 句級重排</h2>
      <p>自動與僅建議分別保存參數。選擇檔位會帶入權重與門檻；也可直接調整數值。</p>
      <Field label="D512 模式">
        <Select
          name="D512Mode"
          value={draft.D512Mode.toString()}
          onChange={(_event, data) =>
            onChange({ ...draft, D512Mode: Number(data.value) as D512Mode })
          }
        >
          <option value="0">關閉</option>
          <option value="1">自動</option>
          <option value="2">僅建議</option>
        </Select>
      </Field>
      <Field
        label="接受建議的按鍵"
        hint="在僅建議模式中選擇接受鍵。Tab 和 Ctrl+Tab 在沒有建議時不改組字；右方向鍵只在句尾接受。"
      >
        <Select
          name="D512SuggestionAcceptKey"
          value={([0, 1, 2].includes(draft.D512SuggestionAcceptKey)
            ? draft.D512SuggestionAcceptKey : 0).toString()}
          disabled={draft.D512Mode !== 2}
          onChange={(_event, data) =>
            onChange({ ...draft, D512SuggestionAcceptKey: Number(data.value) })
          }
        >
          <option value="0">Tab</option>
          <option value="1">Ctrl+Tab</option>
          <option value="2">右方向鍵（句尾）</option>
        </Select>
      </Field>
      <Field label="D512 檔位">
        <Select
          value={d512Preset({ D512Weight: draft[weightKey], D512Margin: draft[marginKey] }, draft.D512Mode)}
          disabled={disabled}
          onChange={(_event, data) => {
            const preset = presets[data.value as keyof typeof presets];
            if (preset) onChange({ ...draft, [weightKey]: preset.D512Weight, [marginKey]: preset.D512Margin });
          }}
        >
          <option value="conservative">保守</option>
          <option value="balanced">平衡</option>
          <option value="aggressive">積極</option>
          <option value="custom">自訂</option>
        </Select>
      </Field>
      {([
        [weightKey, "重排權重 w"],
        [marginKey, "替換門檻 τ"],
      ] as const).map(([key, label]) => {
        const error = d512ValueError(draft[key]);
        return (
          <Field
            key={key}
            label={label}
            validationState={error ? "error" : "none"}
            validationMessage={error}
          >
            <Input
              name={key}
              inputMode="decimal"
              value={draft[key]}
              disabled={disabled}
              onChange={(_event, data) => onChange({ ...draft, [key]: data.value })}
            />
          </Field>
        );
      })}
      {disabled && d512DraftHasErrors(draft) && (
        <p role="status">無效輸入不會儲存，會保留原有數值；切回自動或僅建議後可修正。</p>
      )}
      <Field hint="在本機保存讀音、候選、分數與送出文字。紀錄包含您的個人打字資料，預設關閉。">
        <Checkbox
          label="記錄 D512 校準資料"
          checked={draft.D512LogCalibration === 1}
          onChange={(_event, data) => onChange({ ...draft, D512LogCalibration: data.checked ? 1 : 0 })}
        />
      </Field>
    </section>
  );
}
