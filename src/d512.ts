// SPDX-FileCopyrightText: 2026 Chewing Project Authors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ChewingTsfConfig } from "./config";

// Preserve editing text; the common core owns persistence as f64 values.
export type D512Mode = 0 | 1 | 2;
export type D512Draft = {
  D512Mode: D512Mode;
  D512Weight: string;
  D512Margin: string;
};

export const D512_DEFAULTS: Readonly<D512Draft> = {
  D512Mode: 1,
  D512Weight: "0.25",
  D512Margin: "0.25",
};

export function d512DraftFromConfig(config: ChewingTsfConfig): D512Draft {
  return {
    D512Mode: config.d512_mode,
    D512Weight: String(config.d512_weight),
    D512Margin: String(config.d512_margin),
  };
}

export function withD512Draft(config: ChewingTsfConfig, draft: D512Draft): ChewingTsfConfig {
  if (d512ValueError(draft.D512Weight) || d512ValueError(draft.D512Margin)) {
    throw new Error("D512 數值無效");
  }
  return {
    ...config,
    d512_mode: draft.D512Mode,
    d512_weight: Number(draft.D512Weight),
    d512_margin: Number(draft.D512Margin),
  };
}

export function d512ValueError(text: string): string | undefined {
  const value = text.trim();
  const number = Number(value);
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  // Reject underflow rather than silently accepting a nonzero input as zero.
  const underflow = number === 0 && /[1-9]/.test(value.split(/[eE]/)[0]);
  if (!decimal.test(value) || !Number.isFinite(number) || number < 0 || underflow) {
    return "請輸入大於或等於 0 的有限十進位數值。";
  }
  return undefined;
}

export function d512Preset(
  draft: Pick<D512Draft, "D512Weight" | "D512Margin">,
): "balanced" | "custom" {
  // Compare decimal digits, without rounding edited text through Number first.
  // For now only the balanced pair is calibrated: both values equal 25 * 10^-2.
  const isBalanced = (text: string) => {
    if (d512ValueError(text)) return false;
    const [coefficient, exponent = "0"] = text
      .trim()
      .replace(/^\+/, "")
      .split(/[eE]/);
    const [integer, fraction = ""] = coefficient.split(".");
    const digits = (integer + fraction).replace(/^0+/, "");
    const significant = digits.replace(/0+$/, "");
    const power =
      Number(exponent) - fraction.length + digits.length - significant.length;
    return significant === "25" && power === -2;
  };
  return isBalanced(draft.D512Weight) && isBalanced(draft.D512Margin)
    ? "balanced"
    : "custom";
}
