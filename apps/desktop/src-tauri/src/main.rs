// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Prevent an extra console window on Windows release builds. Kept for
// cross-platform compatibility even though Linux is the primary target.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Thin entry point — all logic lives in lib.rs.
fn main() {
    sublemonable_desktop_lib::run();
}
