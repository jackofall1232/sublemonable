// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

//! Tauri application host for the Sublemonable Linux desktop app.
//!
//! The UI is the existing `apps/web` React build — this crate adds only the
//! three things a browser cannot do: a libsecret keystore, OS-level screenshot
//! inhibit, and Tor-first SOCKS5 detection. No message content and no secret
//! bytes are ever logged here.

mod keystore;
mod screenshot;
mod tor;
mod window;

use tauri::Manager;

/// Build, configure, and run the Tauri application.
pub fn run() {
    init_tracing();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Activate the screenshot inhibit before the user can see content,
            // and wire the focus-driven inhibit lifecycle on the main window.
            window::inhibit_on_ready(&handle);
            if let Some(main) = app.get_webview_window("main") {
                window::harden(&main);
            }

            // Tor-first: probe local SOCKS proxies and announce the connection
            // mode so the existing frontend badge can render Tor / clearnet.
            tauri::async_runtime::spawn(async move {
                tor::detect_and_announce(handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            keystore::store_vault,
            keystore::load_vault,
            keystore::delete_vault,
            screenshot::inhibit_screenshots,
            screenshot::release_inhibit,
            tor::get_proxy_config,
            tor::set_proxy_config,
            tor::check_tor_connectivity,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sublemonable desktop application");
}

/// Structured logging only — errors and system events. Never message content,
/// never secret bytes. Level is controlled by `RUST_LOG` (defaults to `info`).
fn init_tracing() {
    use tracing_subscriber::{fmt, EnvFilter};
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    // `try_init` so a double-init in tests is a no-op rather than a panic.
    let _ = fmt().with_env_filter(filter).try_init();
}
