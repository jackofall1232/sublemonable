// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

//! Transport-independent diagnostic for the WS subprotocol handshake failure.
//!
//! Connects directly to the local plaintext server (no I2P CONNECT tunnel, no
//! TLS) two ways and reports each handshake result:
//!   A) token in the `Sec-WebSocket-Protocol` header (what `ws_open` /
//!      `ws_open_i2p` currently do — the browser auth path), and
//!   B) token in the `?token=` query param (the server's documented
//!      native-client auth path).
//!
//! If A fails with a SubProtocol error and B succeeds, the failure is in the
//! shared tungstenite handshake layer — independent of I2P — and therefore
//! affects the existing clearnet/Tor `ws_open` identically.
//!
//!   WS_DIAG_TOKEN=<jwt> cargo run --example ws_subproto_diag

use futures_util::StreamExt;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;

const SERVER: &str = "127.0.0.1:8443";

#[tokio::main]
async fn main() {
    let token = std::env::var("WS_DIAG_TOKEN").expect("set WS_DIAG_TOKEN");

    // A) Sec-WebSocket-Protocol header (current ws_open / ws_open_i2p approach).
    {
        let tcp = tokio::net::TcpStream::connect(SERVER).await.unwrap();
        let mut req = format!("ws://{SERVER}/ws").into_client_request().unwrap();
        req.headers_mut().insert(
            "Sec-WebSocket-Protocol",
            HeaderValue::from_str(&token).unwrap(),
        );
        match tokio_tungstenite::client_async_with_config(req, tcp, None).await {
            Ok((mut s, resp)) => {
                println!("A) subprotocol-header: OK, HTTP {}", resp.status());
                let _ = s.close(None).await;
            }
            Err(e) => println!("A) subprotocol-header: FAIL — {e}"),
        }
    }

    // B) ?token= query param (server's native-client auth path).
    {
        let tcp = tokio::net::TcpStream::connect(SERVER).await.unwrap();
        let req = format!("ws://{SERVER}/ws?token={token}")
            .into_client_request()
            .unwrap();
        match tokio_tungstenite::client_async_with_config(req, tcp, None).await {
            Ok((mut s, resp)) => {
                println!("B) query-param:        OK, HTTP {}", resp.status());
                // Prove it's a live authenticated socket: unknown event -> error reply.
                use futures_util::SinkExt;
                use tokio_tungstenite::tungstenite::Message;
                s.send(Message::Text(r#"{"type":"diag.ping"}"#.into())).await.unwrap();
                if let Some(Ok(Message::Text(t))) = s.next().await {
                    println!("   round-trip reply: {t}");
                }
                let _ = s.close(None).await;
            }
            Err(e) => println!("B) query-param:        FAIL — {e}"),
        }
    }
}
