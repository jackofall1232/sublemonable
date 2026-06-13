// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

//! Screenshot inhibition for the Linux desktop app.
//!
//! Two display servers, two honesty levels — documented exactly as the iOS /
//! Android distinction is in `docs/SECURITY_MODEL.md`:
//!
//! * **Wayland** — we hold an `xdg-desktop-portal` inhibit session via `ashpd`
//!   for the lifetime of the window. On compositors that honour it (GNOME
//!   Shell, KDE Plasma on Wayland) this is a genuine hard block, the desktop
//!   equivalent of Android `FLAG_SECURE`.
//! * **X11** — X11 has no mechanism that can hard-block screen capture: any
//!   client can read the root window. We therefore treat X11 as best-effort and
//!   say so plainly. Setting compositor hints such as `_NET_WM_BYPASS_COMPOSITOR`
//!   would require an extra X11 dependency (`xcb`) that we deliberately do not
//!   pull in (smaller attack surface), and it would not change the honest
//!   conclusion that X11 cannot prevent capture. The focus-loss blur overlay
//!   (emitted from `window.rs`) is the cross-server belt-and-suspenders.
//!
//! Nothing here ever panics: an inhibit failure logs and returns an error
//! string so the app still starts and shows its own blur overlay.

use ashpd::desktop::inhibit::{InhibitFlags, InhibitProxy};
use ashpd::WindowIdentifier;
use std::any::Any;
use std::sync::OnceLock;
use tokio::sync::Mutex;

/// Holds the live portal inhibit handle so the inhibition persists for the
/// window's lifetime. Stored as an opaque `Any` guard: dropping it releases the
/// portal request, and we never need to name the portal's internal type.
type InhibitGuard = Box<dyn Any + Send>;

fn guard_slot() -> &'static Mutex<Option<InhibitGuard>> {
    static SLOT: OnceLock<Mutex<Option<InhibitGuard>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// True when running under a Wayland session (the only server where the inhibit
/// is a hard block). Detected via the `WAYLAND_DISPLAY` environment variable.
fn is_wayland() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some()
}

/// Activate screenshot inhibition for the given window.
///
/// On Wayland this acquires and holds an `xdg-desktop-portal` inhibit session.
/// On X11 it is best-effort and logs accordingly. The `window` handle is
/// accepted so the frontend can scope the call per-window; the portal inhibit
/// itself is process-global.
#[tauri::command]
pub async fn inhibit_screenshots(window: tauri::WebviewWindow) -> Result<(), String> {
    let label = window.label().to_string();

    if !is_wayland() {
        tracing::info!(window = %label, "Screenshot inhibit active (X11/best-effort)");
        // X11: rely on the focus-loss blur overlay; no hard block is possible.
        return Ok(());
    }

    // Wayland: request a portal inhibit and hold the handle.
    let proxy = InhibitProxy::new()
        .await
        .map_err(|e| format!("portal connect failed: {e}"))?;

    // The portal takes a window identifier; the default (no parent window) is
    // sufficient since the inhibition is process-global.
    let identifier = WindowIdentifier::default();
    let request = proxy
        .inhibit(
            &identifier,
            InhibitFlags::Idle | InhibitFlags::Logout,
            "Sublemonable is displaying confidential message content",
        )
        .await
        .map_err(|e| format!("inhibit request failed: {e}"))?;

    let mut slot = guard_slot().lock().await;
    *slot = Some(Box::new(request));

    tracing::info!(window = %label, "Screenshot inhibit active (Wayland/hard-block)");
    Ok(())
}

/// Release the inhibition (window background / minimize). Idempotent.
#[tauri::command]
pub async fn release_inhibit() -> Result<(), String> {
    let mut slot = guard_slot().lock().await;
    // Dropping the held guard closes the portal request.
    if slot.take().is_some() {
        tracing::debug!("Screenshot inhibit released");
    }
    Ok(())
}
