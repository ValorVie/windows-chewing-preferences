// SPDX-FileCopyrightText: 2026 Chewing Project Authors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Field, Input, Select } from "@fluentui/react-components";
import {
  D512_PRESETS,
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
  return (
    <section aria-labelledby="d512-heading">
      <h2 id="d512-heading">D512 句級重排</h2>
      <p>選擇檔位會帶入權重與門檻；也可直接調整數值。</p>
      <Field
        label="D512 模式"
        hint={draft.D512Mode === 2 ? "尚未支援，暫時等同自動" : undefined}
      >
        <Select
          name="D512Mode"
          value={draft.D512Mode.toString()}
          onChange={(_event, data) =>
            onChange({ ...draft, D512Mode: Number(data.value) as D512Mode })
          }
        >
          <option value="0">關閉</option>
          <option value="1">自動</option>
          <option value="2">僅建議（尚未支援，暫時等同自動）</option>
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
          value={d512Preset(draft)}
          disabled={disabled}
          onChange={(_event, data) => {
            const preset = D512_PRESETS[data.value as keyof typeof D512_PRESETS];
            if (preset) onChange({ ...draft, ...preset });
          }}
        >
          <option value="conservative">保守</option>
          <option value="balanced">平衡</option>
          <option value="aggressive">積極</option>
          <option value="custom">自訂</option>
        </Select>
      </Field>
      {([
        ["D512Weight", "重排權重 w"],
        ["D512Margin", "替換門檻 τ"],
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
              onChange={(_event, data) => onChange({ ...draft, [key]: data.value })}
            />
          </Field>
        );
      })}
    </section>
  );
}
