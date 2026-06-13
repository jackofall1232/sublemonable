// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

//! Window security wiring.
//!
//! * Forces `always-on-top` off (a confidential-content window must never pin
//!   itself above a screen locker or other apps).
//! * Drives the screenshot inhibit lifecycle from window focus:
//!     - focus gained  → (re)activate inhibit
//!     - focus lost     → release inhibit **and** emit `screenshot-attempt` so
//!       the frontend raises the same blur overlay the web client uses. This is
//!       the belt-and-suspenders layer that works identically on Wayland and X11.
//!     - minimize/close → release inhibit.

use tauri::{Emitter, Manager, WebviewWindow, WindowEvent};

use crate::screenshot;

/// Apply window hardening and register the focus-driven inhibit lifecycle.
pub fn harden(window: &WebviewWindow) {
    // A message window must not force itself above everything else.
    if let Err(e) = window.set_always_on_top(false) {
        tracing::debug!(error = %e, "could not clear always-on-top");
    }

    let win = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Focused(true) => {
            let w = win.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = screenshot::inhibit_screenshots(w).await {
                    tracing::debug!(error = %e, "re-inhibit on focus failed");
                }
            });
        }
        WindowEvent::Focused(false) => {
            // Belt-and-suspenders: tell the frontend to blur immediately.
            if let Err(e) = win.emit("screenshot-attempt", ()) {
                tracing::debug!(error = %e, "failed to emit screenshot-attempt");
            }
            tauri::async_runtime::spawn(async move {
                let _ = screenshot::release_inhibit().await;
            });
        }
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
            tauri::async_runtime::spawn(async move {
                let _ = screenshot::release_inhibit().await;
            });
        }
        _ => {}
    });
}

/// Activate the inhibit for a freshly created window before it is shown.
pub fn inhibit_on_ready(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        tauri::async_runtime::spawn(async move {
            if let Err(e) = screenshot::inhibit_screenshots(window).await {
                tracing::warn!(error = %e, "initial screenshot inhibit failed; relying on frontend blur");
            }
        });
    }
}
