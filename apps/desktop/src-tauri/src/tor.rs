// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

//! Tor / SOCKS5 support for the Linux desktop app.
//!
//! v1.5 is **Tor-first**, never an opt-in toggle. On startup the app probes for
//! a local Tor SOCKS proxy (the tor daemon on 9050, then Tor Browser on 9150);
//! if one answers it becomes the active proxy and a `connection-mode-changed`
//! event with `mode = "tor"` is emitted. If neither answers we fall back to
//! clearnet and emit `mode = "clearnet"` with a reason — the existing web/UI
//! connection-mode badge renders the warning (yellow dot) from that event. There
//! is intentionally **no** `set_tor_enabled` command.
//!
//! NOTE on routing: Tauri's webview uses the system WebKit, which does not honour
//! a SOCKS5 proxy set from inside the process. Real traffic routing is done at
//! the OS/process level — launch via `torsocks sublemonable`, or export
//! `ALL_PROXY=socks5h://127.0.0.1:9050` before launch (see apps/desktop/README.md).
//! These commands manage and verify the proxy configuration the frontend reads;
//! they do not themselves rewrite the webview's sockets.

use std::io::ErrorKind;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// SOCKS5 proxy coordinates. Zeroized on drop in case proxy auth fields are ever
/// added in future — today it carries no secret material.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct ProxyConfig {
    pub host: String,
    pub port: u16,
}

/// Default Tor SOCKS endpoints, probed in order: tor daemon, then Tor Browser.
const TOR_DAEMON: (&str, u16) = ("127.0.0.1", 9050);
const TOR_BROWSER: (&str, u16) = ("127.0.0.1", 9150);

const PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const CONNECTIVITY_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(serde::Serialize, Clone)]
struct ConnectionMode {
    /// "tor" or "clearnet".
    mode: &'static str,
    reason: String,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    Ok(dir.join("config.json"))
}

fn read_config(app: &AppHandle) -> Result<Option<ProxyConfig>, String> {
    let path = config_path(app)?;
    match std::fs::read(&path) {
        Ok(bytes) => {
            let cfg: ProxyConfig = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            Ok(Some(cfg))
        }
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn write_config(app: &AppHandle, config: Option<&ProxyConfig>) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    match config {
        Some(cfg) => {
            let json = serde_json::to_vec_pretty(cfg).map_err(|e| e.to_string())?;
            std::fs::write(&path, json).map_err(|e| e.to_string())?;
        }
        None => match std::fs::remove_file(&path) {
            Ok(()) => {}
            Err(e) if e.kind() == ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        },
    }
    Ok(())
}

/// Best-effort: is a TCP listener accepting connections at host:port within the
/// timeout? Used both for startup probing and the UI connectivity check.
fn tcp_reachable(host: &str, port: u16, timeout: Duration) -> bool {
    let Ok(mut addrs) = (host, port).to_socket_addrs() else {
        return false;
    };
    addrs.any(|addr| TcpStream::connect_timeout(&addr, timeout).is_ok())
}

/// Informational only: is `torsocks` on `PATH`? Scans `PATH` without executing
/// anything.
fn torsocks_on_path() -> bool {
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path).any(|dir| {
        let candidate = dir.join("torsocks");
        candidate.is_file()
    })
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Return the currently configured SOCKS5 proxy, if any.
#[tauri::command]
pub fn get_proxy_config(app: AppHandle) -> Result<Option<ProxyConfig>, String> {
    read_config(&app)
}

/// Persist (or clear, with `None`) a custom SOCKS5 proxy host/port.
#[tauri::command]
pub async fn set_proxy_config(app: AppHandle, config: Option<ProxyConfig>) -> Result<(), String> {
    write_config(&app, config.as_ref())
}

/// Verify the configured proxy is reachable (5s timeout). Falls back to the
/// default Tor daemon endpoint when no custom proxy is configured. The UI uses
/// this to show "Tor connected" / "Tor unavailable".
#[tauri::command]
pub async fn check_tor_connectivity(app: AppHandle) -> Result<bool, String> {
    // Read config and probe the socket on a blocking thread so neither the
    // synchronous file read nor the TCP connect stalls the async executor.
    tokio::task::spawn_blocking(move || {
        let (host, port) = match read_config(&app)? {
            Some(cfg) => (cfg.host.clone(), cfg.port),
            None => (TOR_DAEMON.0.to_string(), TOR_DAEMON.1),
        };
        Ok::<bool, String>(tcp_reachable(&host, port, CONNECTIVITY_TIMEOUT))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Tor-first startup probe. Called once after the window is created. Probes the
/// tor daemon then Tor Browser; on success persists the proxy and announces
/// `mode = "tor"`, otherwise announces `mode = "clearnet"`. Never fails the
/// launch — connectivity problems are surfaced through the event, not an error.
pub async fn detect_and_announce(app: AppHandle) {
    let probe_app = app.clone();
    // (endpoint, reachable, persist_if_reachable)
    let outcome = tokio::task::spawn_blocking(move || {
        // Respect a user-configured proxy: probe it, never overwrite it.
        if let Ok(Some(cfg)) = read_config(&probe_app) {
            let reachable = tcp_reachable(&cfg.host, cfg.port, PROBE_TIMEOUT);
            return (Some((cfg.host.clone(), cfg.port)), reachable, false);
        }
        // No saved config: probe the well-known Tor endpoints and persist the
        // first that answers so the frontend can read it back.
        if tcp_reachable(TOR_DAEMON.0, TOR_DAEMON.1, PROBE_TIMEOUT) {
            (Some((TOR_DAEMON.0.to_string(), TOR_DAEMON.1)), true, true)
        } else if tcp_reachable(TOR_BROWSER.0, TOR_BROWSER.1, PROBE_TIMEOUT) {
            (Some((TOR_BROWSER.0.to_string(), TOR_BROWSER.1)), true, true)
        } else {
            (None, false, true)
        }
    })
    .await
    .unwrap_or((None, false, true));

    let event = match outcome {
        (Some((host, port)), true, persist) => {
            if persist {
                if let Err(e) =
                    write_config(&app, Some(&ProxyConfig { host: host.clone(), port }))
                {
                    tracing::debug!(error = %e, "could not persist detected proxy config");
                }
            }
            tracing::info!(port, "Tor SOCKS proxy reachable — routing Tor-first");
            ConnectionMode {
                mode: "tor",
                reason: format!("Tor SOCKS proxy reachable on {host}:{port}"),
            }
        }
        _ => {
            let hint = if torsocks_on_path() {
                "No Tor SOCKS proxy reachable. torsocks is installed — relaunch via `torsocks sublemonable` for Tor routing."
            } else {
                "No Tor SOCKS proxy reachable and torsocks not found. Running on clearnet."
            };
            tracing::warn!("{hint}");
            ConnectionMode { mode: "clearnet", reason: hint.to_string() }
        }
    };

    if let Err(e) = app.emit("connection-mode-changed", event) {
        tracing::debug!(error = %e, "failed to emit connection-mode-changed");
    }
}
