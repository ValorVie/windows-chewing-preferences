// SPDX-FileCopyrightText: 2025-2026 Chewing Project Authors
//
// SPDX-License-Identifier: GPL-3.0-or-later

use std::{env, fs, path::PathBuf};

use scoped_error::{Error, ErrorExt, expect_error};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Version {
    pub product_version: String,
    pub build_date: String,
}

#[tauri::command]
pub fn chewing_version() -> Result<Version, String> {
    let res: Result<_, Error> = expect_error("Failed to get installed chewing version", || {
        let version_path = system_path_for_file("version.json")?;
        let version_json = fs::read_to_string(&version_path).unwrap_or_else(|_| {
            r#"{{ "product_version": "unknown", "build_date": "unknown" }}"#.to_string()
        });
        Ok(serde_json::from_str(&version_json)?)
    });
    res.map_err(|err| format!("{}", err.report()))
}

fn system_path_for_file(file: &str) -> Result<PathBuf, Error> {
    expect_error(
        format!("Failed to determine system path for {file}"),
        || {
            let progfiles_x86 =
                env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files(x86)".into());
            let progfiles = env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
            let path_x86 = PathBuf::from(progfiles_x86)
                .join("ChewingTextService")
                .join(file);
            let path = PathBuf::from(progfiles)
                .join("ChewingTextService")
                .join(file);
            if path_x86.exists() {
                return Ok(path_x86);
            }
            if path.exists() {
                return Ok(path);
            }
            return Err(format!("檔案 {file} 不存在").into());
        },
    )
}
