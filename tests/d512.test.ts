// SPDX-FileCopyrightText: 2026 Chewing Project Authors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "vitest";
import { d512Preset, d512ValueError } from "../src/d512";

test.each(["0", "-0", "0.25", ".25", "1.", "2.5e-1", "1.234567890123456789", "1e308"])(
  "accepts finite nonnegative decimal %s", (value) => {
    expect(d512ValueError(value)).toBeUndefined();
  },
);

test.each(["", " ", "-0.1", "NaN", "Infinity", "-Infinity", "1e309", "1e-4000", "0x10", "1foo", "0,25"])(
  "rejects invalid, negative or unrepresentable input %j", (value) => {
    expect(d512ValueError(value)).toBeTruthy();
  },
);

test.each(["0.25", "0.2500", ".25", "2.5e-1", "025e-2"])(
  "derives balanced from numerically equivalent decimal %s", (value) => {
    expect(d512Preset({ D512Weight: value, D512Margin: "0.5" })).toBe("balanced");
  },
);

test.each([
  [1, { D512Weight: "0.25", D512Margin: "1" }, "conservative"],
  [1, { D512Weight: "0.25", D512Margin: "0.5" }, "balanced"],
  [1, { D512Weight: "0.25", D512Margin: "0.2" }, "aggressive"],
  [2, { D512Weight: "0.25", D512Margin: "3" }, "conservative"],
  [2, { D512Weight: "0.25", D512Margin: "2" }, "balanced"],
  [2, { D512Weight: "0.25", D512Margin: "1" }, "aggressive"],
  [1, { D512Weight: "025e-2", D512Margin: ".5000" }, "balanced"],
  [2, { D512Weight: "2.5e-1", D512Margin: "20e-1" }, "balanced"],
  [1, { D512Weight: "0.25", D512Margin: "0.20000000000000001" }, "custom"],
  [2, { D512Weight: "0.25000000000000001", D512Margin: "1" }, "custom"],
  [1, { D512Weight: "0.25", D512Margin: "0.8" }, "custom"],
  [2, { D512Weight: "0.25", D512Margin: "0.5" }, "custom"],
] as const)("mode %i derives preset for %j as %s", (mode, values, expected) => {
  expect(d512Preset(values, mode)).toBe(expected);
});

test.each([
  { D512Weight: "0.25000000000000001", D512Margin: "0.5" },
  { D512Weight: "0.25", D512Margin: "0.50000000000000001" },
  { D512Weight: "0", D512Margin: "0.5" },
  { D512Weight: "0.25", D512Margin: "" },
])("derives custom from edited or invalid pair %j", (values) => {
  expect(d512Preset(values)).toBe("custom");
});
