// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

//! Screenshot defense for the Linux desktop app — best-effort, and honest about it.
//!
//! Linux has **no** compositor-agnostic API to hard-block screen capture:
//!
//! * On **X11** any client can read the root window, so capture cannot be
//!   prevented at all.
//! * On **Wayland** capture is mediated by the compositor, and there is no
//!   standard `xdg-desktop-portal` (or other portable) interface a normal app
//!   can call to forbid screenshots/screencasts of its window. (The portal
//!   `Inhibit` API only blocks idle/suspend/logout — not screen capture — so we
//!   deliberately do not use it here: calling it would imply a protection it
//!   does not provide.)
//!
//! So on Linux the protection is the same as the browser platform: a focus-loss
//! blur overlay. When the window loses focus we emit a `screenshot-attempt`
//! event and the frontend raises its existing blur overlay (the same one the web
//! client uses on `visibilitychange` / blur). This is best-effort, not a hard
//! block, and the docs say exactly that.

use tauri::{Emitter, WebviewWindow};

/// Signal the frontend to raise its blur overlay (best-effort screenshot
/// defense). Called on window focus loss. Never panics — a failed emit is logged
/// and ignored so the app keeps running.
pub fn signal_blur(window: &WebviewWindow) {
    if let Err(e) = window.emit("screenshot-attempt", ()) {
        tracing::debug!(error = %e, "failed to emit screenshot-attempt");
    }
}
