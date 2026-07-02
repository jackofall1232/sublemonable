// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

//! I2P relay transport for the Linux desktop app.
//!
//! On startup the app probes `127.0.0.1:4444` (the i2pd default HTTP proxy).
//! If it answers, I2P is active — a `connection-mode-changed` event with
//! `mode = "i2p"` is emitted and the Tor probe is skipped (I2P is primary in
//! the fixed fallback chain). REST traffic is routed through the local i2pd HTTP
//! proxy via a separate `reqwest` client. The relay I2P destination is baked in
//! at build time (`RELAY_I2P_DEST`); the WebView cannot supply an arbitrary
//! destination at runtime.
//!
//! No TLS over I2P: the `.b32.i2p` address is the cryptographic identity of the
//! destination — authentication happens at the I2P layer, not at TLS. This is the
//! same principle as no-TLS-over-onion (see docs/TOR_ARCHITECTURE.md §4).
//!
//! WS-OVER-I2P: unverified. WebSocket upgrade through i2pd's HTTP proxy requires
//! HTTP CONNECT tunneling not trivially supported by tokio-tungstenite. REST
//! (`i2p_request`) is the confirmed-working path. Track: TODO(i2p-ws-verify).

use std::collections::HashMap;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Default i2pd HTTP proxy — the client-side port that routes .b32.i2p requests.
const I2PD_HTTP_PROXY: (&str, u16) = ("127.0.0.1", 4444);

const PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const CONNECTIVITY_TIMEOUT: Duration = Duration::from_secs(5);

/// Relay I2P destination baked in at build time — the I2P analogue of
/// `pinning::API_HOST`. Authentication is by the B32 address (the cryptographic
/// identity), not TLS. Never supplied by the WebView at runtime.
const RELAY_I2P_DEST: &str = env!("RELAY_I2P_DEST");

/// Shared reqwest client that routes all HTTP requests through the local i2pd
/// HTTP proxy at `127.0.0.1:4444`. Not https_only — I2P destinations are
/// plain `http://`, with I2P providing transport-layer security.
pub struct I2pHttp(pub reqwest::Client);

/// Build the I2P-proxied reqwest client. Panics only at startup if the proxy
/// URL is malformed — which it never will be for the hard-coded value.
pub fn build_i2p_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .proxy(
            reqwest::Proxy::http("http://127.0.0.1:4444")
                .expect("valid i2pd HTTP proxy URL"),
        )
        .build()
        .expect("build i2p http client")
}

#[derive(serde::Serialize, Clone)]
struct ConnectionMode {
    mode: &'static str,
    reason: String,
}

fn tcp_reachable(host: &str, port: u16, timeout: Duration) -> bool {
    let Ok(mut addrs) = (host, port).to_socket_addrs() else {
        return false;
    };
    addrs.any(|addr| TcpStream::connect_timeout(&addr, timeout).is_ok())
}

/// I2P-first startup probe. Called once after the window is created, before the
/// Tor probe. Returns `true` and emits `connection-mode-changed` with `mode =
/// "i2p"` when the i2pd HTTP proxy is reachable; returns `false` without emitting
/// so the caller can fall through to the Tor probe.
pub async fn detect_and_announce(app: AppHandle) -> bool {
    let reachable = tokio::task::spawn_blocking(|| {
        tcp_reachable(I2PD_HTTP_PROXY.0, I2PD_HTTP_PROXY.1, PROBE_TIMEOUT)
    })
    .await
    .unwrap_or(false);

    if !reachable {
        return false;
    }

    let reason = if RELAY_I2P_DEST.is_empty() {
        "i2pd HTTP proxy reachable on 127.0.0.1:4444 (RELAY_I2P_DEST not set — rebuild with relay destination to enable routing)".to_string()
    } else {
        format!("i2pd HTTP proxy reachable on 127.0.0.1:4444 → relay at {RELAY_I2P_DEST}")
    };
    tracing::info!("I2P proxy reachable — routing I2P-first");
    if let Err(e) = app.emit("connection-mode-changed", ConnectionMode { mode: "i2p", reason }) {
        tracing::debug!(error = %e, "failed to emit connection-mode-changed (i2p)");
    }
    true
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Check if the local i2pd HTTP proxy at 127.0.0.1:4444 is currently reachable.
/// Used by `detectI2P()` in `transportResolver.ts` on the Tauri path.
#[tauri::command]
pub async fn check_i2p_connectivity() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| {
        Ok::<bool, String>(tcp_reachable(
            I2PD_HTTP_PROXY.0,
            I2PD_HTTP_PROXY.1,
            CONNECTIVITY_TIMEOUT,
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Perform an HTTP REST request through the local i2pd HTTP proxy to the relay
/// I2P destination. The destination is validated against the build-time constant
/// `RELAY_I2P_DEST` — the WebView cannot supply an arbitrary destination.
///
/// I2P provides transport-layer authentication (the B32 address IS the public key),
/// so no TLS or SPKI pinning is applied. See docs/TOR_ARCHITECTURE.md §4.
///
/// Note on WebSocket: WS-over-I2P is NOT handled here. `tokio-tungstenite` does
/// not trivially support HTTP CONNECT proxy tunneling. The WS path falls back to
/// the Tor/clearnet commands until empirically verified. TODO(i2p-ws-verify).
#[tauri::command]
pub async fn i2p_request(
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    i2p_http: tauri::State<'_, I2pHttp>,
) -> Result<crate::transport::HttpResponse, String> {
    if RELAY_I2P_DEST.is_empty() {
        return Err(
            "RELAY_I2P_DEST not set at build time — rebuild with the relay I2P destination"
                .to_string(),
        );
    }
    let parsed = url::Url::parse(&url).map_err(|_| "invalid url".to_string())?;
    if parsed.scheme() != "http" {
        return Err(
            "I2P requests must use http:// — I2P provides transport security, not TLS".to_string(),
        );
    }
    if parsed.host_str() != Some(RELAY_I2P_DEST) {
        return Err("refusing i2p request to non-relay destination".to_string());
    }
    let m =
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| "bad method".to_string())?;
    let mut req = i2p_http.0.request(m, parsed);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    let res = req
        .send()
        .await
        .map_err(|e| format!("i2p request failed: {e}"))?;
    let status = res.status().as_u16();
    let body_text = res
        .text()
        .await
        .map_err(|e| format!("read body failed: {e}"))?;
    Ok(crate::transport::HttpResponse { status, body: body_text })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relay_dest_constant_does_not_panic() {
        // compile-time env — exercises the macro without requiring a network.
        let _ = RELAY_I2P_DEST.len();
    }

    #[test]
    fn build_i2p_http_client_does_not_panic() {
        let _ = build_i2p_http_client();
    }
}
