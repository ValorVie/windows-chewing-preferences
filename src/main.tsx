// SPDX-FileCopyrightText: 2025-2026 Chewing Project Authors
//
// SPDX-License-Identifier: GPL-3.0-or-later

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import About from "./About";
import { invoke } from "@tauri-apps/api/core";
import { getAllWindows } from "@tauri-apps/api/window";
import { usePrefersColorScheme } from "./theme";
import {
  FluentProvider,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";

getAllWindows().then(async (wins) => {
  let version = await invoke("chewing_version") as { product_version: string, build_date: string };
  for (const w of wins) {
    let title = await w.title();
    if (!title.includes(version.product_version)) {
      w.setTitle(`${title} (${version.product_version})`);
    }
  }
});

function Root() {
  const isDarkTheme = usePrefersColorScheme();

  return (
    <React.StrictMode>
      <FluentProvider theme={isDarkTheme ? webDarkTheme : webLightTheme}>
        {location.hash == "" && <App />}
        {location.hash == "#about" && <About />}
      </FluentProvider>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <Root />,
);
