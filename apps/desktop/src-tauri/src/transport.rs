// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

//! Certificate-pinned network transport for the desktop client.
//!
//! The bundled `apps/web` UI cannot pin TLS from inside the system WebView, so
//! the desktop build routes its REST and WebSocket traffic through these Tauri
//! commands instead of the WebView's own `fetch`/`WebSocket`. Every connection
//! is made by a `reqwest`/`tokio-tungstenite` client configured with a custom
//! rustls verifier ([`PinnedVerifier`]) that:
//!
//!   1. performs the *standard* WebPKI chain + hostname validation, then
//!   2. requires the leaf certificate's SPKI hash to be one of [`crate::pinning::PINS`].
//!
//! FAIL-CLOSED is the invariant: every error path (parse failure, chain
//! failure, pin mismatch, unsupported scheme) returns `Err`, so a connection is
//! accepted ONLY when both the chain is valid AND the pin matches. The verifier
//! never widens trust — it can only reject what WebPKI already accepted.
//!
//! TLS 1.3 is the only enabled protocol version, matching the server's
//! transport requirement.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use base64::prelude::*;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::mpsc;

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::client::WebPkiServerVerifier;
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, RootCertStore, SignatureScheme};

// ── rustls pinning verifier ──────────────────────────────────────────────────

/// A `ServerCertVerifier` that delegates full WebPKI validation to an inner
/// verifier and then enforces the SPKI pin on the leaf certificate.
#[derive(Debug)]
struct PinnedVerifier {
    inner: Arc<WebPkiServerVerifier>,
}

impl PinnedVerifier {
    /// SHA-256/base64 SPKI pin of a leaf certificate, in `sha256/<base64>` form.
    /// Returns `None` if the certificate cannot be parsed (treated as failure
    /// by the caller — fail closed).
    fn leaf_spki_pin(end_entity: &CertificateDer<'_>) -> Option<String> {
        // Parse just enough DER to recover the SubjectPublicKeyInfo bytes.
        let (_, cert) = x509_parser::parse_x509_certificate(end_entity.as_ref()).ok()?;
        let spki_der = cert.tbs_certificate.subject_pki.raw; // DER of the full SPKI
        let digest = Sha256::digest(spki_der);
        Some(format!("sha256/{}", BASE64_STANDARD.encode(digest)))
    }
}

impl ServerCertVerifier for PinnedVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        ocsp_response: &[u8],
        now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        // 1. Standard chain + hostname + expiry validation. Propagates Err.
        self.inner
            .verify_server_cert(end_entity, intermediates, server_name, ocsp_response, now)?;

        // 2. SPKI pin on the leaf. Any failure to derive or match -> reject.
        let pin = Self::leaf_spki_pin(end_entity)
            .ok_or_else(|| rustls::Error::General("leaf certificate parse failed".into()))?;
        if crate::pinning::is_pinned(&pin) {
            Ok(ServerCertVerified::assertion())
        } else {
            // Do not log the pin at error level in a privacy app; the mismatch
            // itself is the signal. A debug line aids self-host setup only.
            tracing::warn!("TLS pin mismatch — refusing connection");
            Err(rustls::Error::General("certificate SPKI pin mismatch".into()))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        self.inner.verify_tls12_signature(message, cert, dss)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        self.inner.verify_tls13_signature(message, cert, dss)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.inner.supported_verify_schemes()
    }
}

/// Build the shared, pinned rustls client config (TLS 1.3 only). Panics only at
/// startup if the static WebPKI root set or crypto provider cannot be built —
/// failing to start is the correct response, since running unpinned would
/// silently weaken every client's threat model.
pub fn pinned_tls_config() -> Arc<ClientConfig> {
    let mut roots = RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    let webpki = WebPkiServerVerifier::builder(Arc::new(roots))
        .build()
        .expect("build WebPKI verifier from bundled roots");

    let verifier = Arc::new(PinnedVerifier { inner: webpki });

    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = ClientConfig::builder_with_provider(provider)
        .with_protocol_versions(&[&rustls::version::TLS13])
        .expect("TLS 1.3 is supported by the ring provider")
        .dangerous() // "dangerous" only because we replace the verifier; ours is STRICTER.
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();

    Arc::new(config)
}

// ── managed state ─────────────────────────────────────────────────────────────

/// Pinned reqwest client, shared across REST calls.
pub struct PinnedHttp(pub reqwest::Client);

/// Shared rustls config, reused for each WebSocket dial.
pub struct PinnedTls(pub Arc<ClientConfig>);

/// Live WebSocket connections, keyed by an opaque id handed back to the UI.
/// Fields are `pub(crate)` so `i2p::ws_open_i2p` can register its connections
/// in the same registry — `ws_send`/`ws_close` then work identically for
/// pinned-TLS and I2P-tunneled sockets.
#[derive(Default)]
pub struct WsRegistry {
    pub(crate) next_id: AtomicU64,
    pub(crate) conns: Mutex<HashMap<u64, mpsc::UnboundedSender<String>>>,
}

/// Build the pinned reqwest client. `https_only` rejects any accidental plain
/// HTTP; the pinned verifier rejects any host whose leaf isn't pinned.
pub fn build_http_client(tls: Arc<ClientConfig>) -> reqwest::Client {
    reqwest::Client::builder()
        .use_preconfigured_tls((*tls).clone())
        .https_only(true)
        .build()
        .expect("build pinned reqwest client")
}

// ── REST command ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

/// Perform a pinned HTTPS request. The UI passes an absolute URL; we require it
/// to target the pinned host over https so the WebView can't be tricked into
/// using this client as an open proxy (the pin would reject other hosts anyway).
#[tauri::command]
pub async fn pinned_request(
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    http: State<'_, PinnedHttp>,
) -> Result<HttpResponse, String> {
    let parsed = url::Url::parse(&url).map_err(|_| "invalid url".to_string())?;
    if parsed.scheme() != "https" {
        return Err("refusing non-https request".into());
    }
    if parsed.host_str() != Some(crate::pinning::API_HOST) {
        return Err("refusing request to non-pinned host".into());
    }

    let m = reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| "bad method".to_string())?;
    let mut req = http.0.request(m, parsed);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    if let Some(b) = body {
        req = req.body(b);
    }

    let res = req.send().await.map_err(|e| format!("request failed: {e}"))?;
    let status = res.status().as_u16();
    let body = res.text().await.map_err(|e| format!("read body failed: {e}"))?;
    Ok(HttpResponse { status, body })
}

// ── WebSocket commands ─────────────────────────────────────────────────────────

/// Events streamed to the UI over a Tauri [`Channel`] for one connection.
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum WsEvent {
    Open,
    Message { data: String },
    Closed { reason: String },
}

/// Open a pinned WebSocket to `wss://<API_HOST>/ws`, authenticating with `token`
/// via the `?token=` query param. Incoming text frames and lifecycle events are
/// streamed to `on_event`. Returns an id for [`ws_send`]/[`ws_close`].
///
/// Auth rides the `?token=` query param (the server's native-client path), NOT
/// `Sec-WebSocket-Protocol`: tungstenite 0.24 fails the handshake when it
/// requests a subprotocol the server does not echo back (`"Server sent no
/// subprotocol"`), and the gofiber server never echoes one. The browser client
/// keeps using the subprotocol header (browsers tolerate the missing echo). The
/// token stays confidential — the query string travels inside the pinned TLS
/// (and, over Tor, the circuit) to a server that does no access logging — and an
/// invalid token can only yield control characters that `into_client_request`
/// rejects below (CRLF-injection guard). See `i2p::ws_open_i2p` for the same
/// mechanism over I2P.
#[tauri::command]
pub async fn ws_open(
    token: String,
    on_event: Channel<WsEvent>,
    tls: State<'_, PinnedTls>,
    registry: State<'_, WsRegistry>,
) -> Result<u64, String> {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tokio_tungstenite::tungstenite::Message;
    use tokio_tungstenite::Connector;

    let ws_url = format!("wss://{}/ws?token={token}", crate::pinning::API_HOST);
    let request = ws_url
        .into_client_request()
        .map_err(|e| format!("bad ws url (token rejected): {e}"))?;

    let connector = Connector::Rustls(tls.0.clone());
    let (stream, _resp) =
        tokio_tungstenite::connect_async_tls_with_config(request, None, false, Some(connector))
            .await
            .map_err(|e| format!("ws connect failed: {e}"))?;

    let (mut write, mut read) = stream.split();

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

/// Send a text frame on an open connection.
#[tauri::command]
pub fn ws_send(id: u64, data: String, registry: State<'_, WsRegistry>) -> Result<(), String> {
    let conns = registry.conns.lock().map_err(|_| "registry lock poisoned")?;
    let tx = conns.get(&id).ok_or("no such ws connection")?;
    tx.send(data).map_err(|_| "ws connection closed".into())
}

/// Close a connection and drop its registry entry (which ends the outbound pump).
#[tauri::command]
pub fn ws_close(id: u64, registry: State<'_, WsRegistry>) -> Result<(), String> {
    let mut conns = registry.conns.lock().map_err(|_| "registry lock poisoned")?;
    conns.remove(&id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn building_pinned_config_does_not_panic() {
        // Exercises the WebPKI root load + ring provider + TLS1.3 selection.
        let _ = pinned_tls_config();
    }

    #[test]
    fn unknown_leaf_pin_is_not_accepted() {
        // A pin not in crate::pinning::PINS must be rejected (fail closed).
        assert!(!crate::pinning::is_pinned(
            "sha256/ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ="
        ));
    }
}
