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
//! WS-OVER-I2P: implemented via HTTP CONNECT tunneling in [`ws_open_i2p`] and
//! verified end-to-end on 2026-07-02 against a live i2pd + relay server tunnel
//! (i2pd's HTTP proxy DOES accept `CONNECT <b32>:80`; two sessions upgraded,
//! a message round-tripped, both survived 60s idle). Auth uses the `?token=`
//! query param, not `Sec-WebSocket-Protocol` (see [`ws_open_i2p`]).

use std::collections::HashMap;
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::Ordering;
use std::time::Duration;

use base64::prelude::*;
use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter, State};
use tauri::ipc::Channel;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

use crate::transport::{WsEvent, WsRegistry};

/// Default i2pd HTTP proxy — the client-side port that routes .b32.i2p requests.
const I2PD_HTTP_PROXY: (&str, u16) = ("127.0.0.1", 4444);

const PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const CONNECTIVITY_TIMEOUT: Duration = Duration::from_secs(5);

/// Per-step timeout for the I2P WebSocket dial (proxy connect, CONNECT
/// handshake, WS upgrade). I2P destination lookup and tunnel build can take
/// tens of seconds on a cold router; beyond that the dial is treated as failed
/// so the UI promise rejects instead of hanging in CONNECTING forever.
const WS_I2P_STEP_TIMEOUT: Duration = Duration::from_secs(30);

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

/// Open a WebSocket connection through the local i2pd HTTP proxy using HTTP
/// CONNECT tunneling.
///
/// The sequence is:
///   1. TCP-connect to `127.0.0.1:4444` (i2pd HTTP proxy).
///   2. Send `CONNECT <RELAY_I2P_DEST>:80 HTTP/1.1` to ask the proxy to open
///      a tunnel to the relay I2P destination.
///   3. Read the proxy response; fail with the first line if the proxy refuses.
///   4. Perform the WebSocket handshake over the resulting TCP tunnel using
///      `ws://` (not `wss://`) — I2P provides transport-layer security at the
///      network layer, so no TLS is added (same principle as no-TLS-over-onion;
///      see docs/TOR_ARCHITECTURE.md §4). Auth rides the `?token=` query param
///      (the server's native-client path), NOT `Sec-WebSocket-Protocol`:
///      tungstenite 0.24 fails the handshake when it requests a subprotocol the
///      server does not echo, and the gofiber server never echoes one.
///   5. Stream lifecycle events and text frames to `on_event`; return an opaque
///      id for use with [`ws_send`]/[`ws_close`].
///
/// `RELAY_I2P_DEST` is the build-time constant; the WebView cannot supply an
/// arbitrary destination at runtime.
///
/// Verified end-to-end on 2026-07-02 against a live i2pd + relay server tunnel:
/// two authenticated sessions upgraded (101), a `message.send` round-tripped
/// A -> server -> B, both connections survived 60s idle across a server ping
/// cycle, and a post-idle message round-tripped. i2pd's HTTP proxy DOES accept
/// `CONNECT <b32>:80` to an I2P destination (returns `HTTP/1.1 200`).
#[tauri::command]
pub async fn ws_open_i2p(
    token: String,
    on_event: Channel<WsEvent>,
    registry: State<'_, WsRegistry>,
) -> Result<u64, String> {
    if RELAY_I2P_DEST.is_empty() {
        return Err(
            "RELAY_I2P_DEST not set at build time — rebuild with the relay I2P destination"
                .to_string(),
        );
    }

    let relay_dest = RELAY_I2P_DEST;

    // Step 1: TCP-connect to the i2pd HTTP proxy.
    let mut tcp_stream = tokio::time::timeout(
        WS_I2P_STEP_TIMEOUT,
        tokio::net::TcpStream::connect("127.0.0.1:4444"),
    )
    .await
    .map_err(|_| "timed out connecting to i2pd HTTP proxy".to_string())?
    .map_err(|e| format!("failed to connect to i2pd HTTP proxy: {e}"))?;

    // Steps 2-3: Send HTTP CONNECT and read the proxy response byte-by-byte
    // until \r\n\r\n (cap at 4096). Byte-by-byte is deliberate: it stops exactly
    // at the end of the proxy response and never over-reads into WebSocket
    // handshake bytes the proxy may pipeline right after the 200. The whole
    // exchange is bounded by WS_I2P_STEP_TIMEOUT — i2pd accepts the local TCP
    // connection immediately but can stall the 200 while the I2P tunnel builds,
    // and an unbounded read would hang the UI promise forever.
    let connect_req = format!("CONNECT {relay_dest}:80 HTTP/1.1\r\nHost: {relay_dest}\r\n\r\n");
    let first_line = tokio::time::timeout(WS_I2P_STEP_TIMEOUT, async {
        tcp_stream
            .write_all(connect_req.as_bytes())
            .await
            .map_err(|e| format!("failed to write CONNECT request: {e}"))?;
        let mut response_buf: Vec<u8> = Vec::with_capacity(256);
        let mut byte = [0u8; 1];
        loop {
            if response_buf.len() >= 4096 {
                return Err("proxy CONNECT response exceeded 4096 bytes".to_string());
            }
            tcp_stream
                .read_exact(&mut byte)
                .await
                .map_err(|e| format!("failed to read CONNECT response: {e}"))?;
            response_buf.push(byte[0]);
            if response_buf.ends_with(b"\r\n\r\n") {
                break;
            }
        }
        let response_str = String::from_utf8_lossy(&response_buf);
        Ok(response_str.lines().next().unwrap_or("").to_string())
    })
    .await
    .map_err(|_| "timed out waiting for i2pd CONNECT response".to_string())??;

    // Exact status-token match ("HTTP/1.x 200 ..."), not a prefix match.
    let mut parts = first_line.split_whitespace();
    let version_ok = parts.next().is_some_and(|v| v.starts_with("HTTP/1."));
    let status_ok = parts.next() == Some("200");
    if !version_ok || !status_ok {
        return Err(format!("i2pd CONNECT refused: {first_line}"));
    }

    // Step 4: WebSocket handshake over the CONNECT tunnel.
    // ws:// not wss:// — I2P provides transport security; no TLS layer needed (§4).
    //
    // Auth rides the `?token=` query param, which is the server's documented
    // native-client path (see the /ws middleware in server/cmd/server/main.go).
    // The browser client instead passes the token via `Sec-WebSocket-Protocol`,
    // but tungstenite 0.24 treats a requested subprotocol that the server does
    // not echo back as a hard handshake error ("Server sent no subprotocol"),
    // and the gofiber server never echoes one. Browsers tolerate the missing
    // echo; tungstenite does not. The token is a short-lived (15 min) JWT and
    // the URL travels inside the encrypted I2P tunnel to a server that does no
    // access logging, so the query param is not an exposure regression over the
    // header. An invalid token can only produce control characters that
    // `into_client_request` rejects below (CRLF-injection guard).
    let ws_url = format!("ws://{relay_dest}/ws?token={token}");
    let request = ws_url
        .into_client_request()
        .map_err(|e| format!("bad ws url (token rejected): {e}"))?;

    let (stream, _resp) = tokio::time::timeout(
        WS_I2P_STEP_TIMEOUT,
        tokio_tungstenite::client_async_with_config(request, tcp_stream, None),
    )
    .await
    .map_err(|_| "timed out during WebSocket handshake over I2P tunnel".to_string())?
    .map_err(|e| format!("ws connect failed: {e}"))?;

    let (mut write, mut read) = stream.split();

    // Step 5: Register the connection and start the pump tasks.
    let id = registry.next_id.fetch_add(1, Ordering::Relaxed);
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    registry
        .conns
        .lock()
        .map_err(|_| "registry lock poisoned".to_string())?
        .insert(id, tx);

    let _ = on_event.send(WsEvent::Open);

    // Outbound pump: UI -> server. Ends when the sender (registry entry) drops.
    tokio::spawn(async move {
        while let Some(text) = rx.recv().await {
            if write.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
        let _ = write.close().await;
    });

    // Inbound pump: server -> UI channel.
    let event_sink = on_event.clone();
    tokio::spawn(async move {
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(t)) => {
                    let _ = event_sink.send(WsEvent::Message {
                        data: t.to_string(),
                    });
                }
                Ok(Message::Binary(b)) => {
                    // Server frames are JSON text; base64 any stray binary so the
                    // UI can still inspect it rather than silently dropping.
                    let _ = event_sink.send(WsEvent::Message {
                        data: BASE64_STANDARD.encode(b),
                    });
                }
                Ok(Message::Close(_)) | Err(_) => break,
                _ => {} // ping/pong/frame — handled by tungstenite
            }
        }
        let _ = event_sink.send(WsEvent::Closed {
            reason: "stream ended".into(),
        });
    });

    Ok(id)
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
