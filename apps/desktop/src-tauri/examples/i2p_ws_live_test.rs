// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

//! Live end-to-end test of the WS-over-I2P dial sequence used by `ws_open_i2p`.
//!
//! Replicates the exact transport mechanism of the Tauri command (HTTP CONNECT
//! through the local i2pd proxy at 127.0.0.1:4444, then a `ws://` WebSocket
//! handshake over the raw tunnel) against the real relay I2P destination, with
//! TWO authenticated sessions, and verifies the TODO(i2p-ws-live-test)
//! acceptance criteria:
//!
//!   1. both WebSocket upgrades succeed (101 Switching Protocols),
//!   2. a real message round-trips between the two authenticated sessions
//!      (`message.send` from A -> server store + live delivery -> B receives
//!      `message.deliver` with the same envelope id),
//!   3. both connections survive >= 60 seconds idle (spanning one full server
//!      ping cycle — the server pings every 50s and drops after 60s pongWait,
//!      so surviving 60s idle proves ping/pong flows through the I2P tunnel),
//!   4. a second message round-trips after the idle period (no silent drop).
//!
//! Run (requires a bootstrapped local i2pd with its HTTP proxy on 4444 and two
//! fresh sessions minted via /api/v1/register + /api/v1/session):
//!
//!   I2P_WS_TEST_DEST=<b32>.b32.i2p \
//!   I2P_WS_TEST_ACCOUNT_A=<uuid> I2P_WS_TEST_TOKEN_A=<jwt> \
//!   I2P_WS_TEST_ACCOUNT_B=<uuid> I2P_WS_TEST_TOKEN_B=<jwt> \
//!     cargo run --example i2p_ws_live_test

use std::time::{Duration, Instant};

use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::WebSocketStream;

const STEP_TIMEOUT: Duration = Duration::from_secs(30);
const IDLE_SECS: u64 = 60;

type WsSink = SplitSink<WebSocketStream<TcpStream>, Message>;
type WsSource = SplitStream<WebSocketStream<TcpStream>>;

fn env(name: &str) -> Result<String, String> {
    std::env::var(name).map_err(|_| format!("set {name}"))
}

/// A random v4 UUID from /dev/urandom — avoids adding a uuid crate dependency
/// for a test harness.
fn uuid_v4() -> Result<String, String> {
    let mut b = [0u8; 16];
    use std::io::Read;
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut b))
        .map_err(|e| format!("urandom: {e}"))?;
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]
    ))
}

/// The exact dial sequence of `ws_open_i2p`: TCP to the i2pd HTTP proxy, HTTP
/// CONNECT to the relay destination, byte-by-byte response read, exact 200
/// status-token check, then a ws:// handshake over the raw tunnel.
async fn dial(dest: &str, token: &str, label: &str) -> Result<WebSocketStream<TcpStream>, String> {
    let t0 = Instant::now();
    let mut tcp = tokio::time::timeout(STEP_TIMEOUT, TcpStream::connect("127.0.0.1:4444"))
        .await
        .map_err(|_| "timed out connecting to i2pd proxy".to_string())?
        .map_err(|e| format!("proxy connect failed: {e}"))?;

    let connect_req = format!("CONNECT {dest}:80 HTTP/1.1\r\nHost: {dest}\r\n\r\n");
    let first_line = tokio::time::timeout(STEP_TIMEOUT, async {
        tcp.write_all(connect_req.as_bytes())
            .await
            .map_err(|e| format!("CONNECT write failed: {e}"))?;
        let mut buf: Vec<u8> = Vec::with_capacity(256);
        let mut byte = [0u8; 1];
        loop {
            if buf.len() >= 4096 {
                return Err("CONNECT response exceeded 4096 bytes".to_string());
            }
            tcp.read_exact(&mut byte)
                .await
                .map_err(|e| format!("CONNECT read failed: {e}"))?;
            buf.push(byte[0]);
            if buf.ends_with(b"\r\n\r\n") {
                break;
            }
        }
        Ok(String::from_utf8_lossy(&buf).lines().next().unwrap_or("").to_string())
    })
    .await
    .map_err(|_| "timed out waiting for CONNECT response".to_string())??;

    let mut parts = first_line.split_whitespace();
    let version_ok = parts.next().is_some_and(|v| v.starts_with("HTTP/1."));
    let status_ok = parts.next() == Some("200");
    if !version_ok || !status_ok {
        return Err(format!("CONNECT refused: {first_line}"));
    }
    println!("[{label}] CONNECT tunnel: {first_line} ({:?})", t0.elapsed());

    // Auth via ?token= query param — the server's native-client path. See
    // ws_open_i2p: tungstenite 0.24 rejects a non-echoed subprotocol, so the
    // Sec-WebSocket-Protocol (browser) path fails the handshake.
    let ws_url = format!("ws://{dest}/ws?token={token}");
    let request = ws_url
        .into_client_request()
        .map_err(|e| format!("bad ws url: {e}"))?;
    let (stream, resp) = tokio::time::timeout(
        STEP_TIMEOUT,
        tokio_tungstenite::client_async_with_config(request, tcp, None),
    )
    .await
    .map_err(|_| "timed out during WS handshake".to_string())?
    .map_err(|e| format!("ws handshake failed: {e}"))?;
    println!(
        "[{label}] WebSocket upgrade: HTTP {} ({:?})",
        resp.status(),
        t0.elapsed()
    );
    if resp.status().as_u16() != 101 {
        return Err(format!("expected 101, got {}", resp.status()));
    }
    Ok(stream)
}

/// Read frames until a text frame containing `needle` arrives; count pings.
async fn wait_for(source: &mut WsSource, needle: &str, label: &str) -> Result<String, String> {
    tokio::time::timeout(STEP_TIMEOUT, async {
        while let Some(msg) = source.next().await {
            match msg.map_err(|e| format!("[{label}] read failed: {e}"))? {
                Message::Text(t) => {
                    let t = t.to_string();
                    if t.contains(needle) {
                        return Ok(t);
                    }
                    println!("[{label}] (other frame: {t})");
                }
                _ => continue,
            }
        }
        Err(format!("[{label}] stream ended before '{needle}'"))
    })
    .await
    .map_err(|_| format!("[{label}] timed out waiting for '{needle}'"))?
}

/// Send one A->B message and confirm B receives the matching deliver event.
async fn round_trip(
    a_sink: &mut WsSink,
    b_source: &mut WsSource,
    account_a: &str,
    account_b: &str,
    phase: &str,
) -> Result<(), String> {
    let msg_id = uuid_v4()?;
    let envelope = format!(
        r#"{{"id":"{msg_id}","recipient_id":"{account_b}","sender_id":"{account_a}","payload":"aTJwLWxpdmUtdGVzdA=="}}"#
    );
    let event = format!(r#"{{"type":"message.send","envelope":{envelope}}}"#);
    let rt0 = Instant::now();
    a_sink
        .send(Message::Text(event.into()))
        .await
        .map_err(|e| format!("send failed: {e}"))?;
    let delivered = wait_for(b_source, &msg_id, "B").await?;
    if !delivered.contains("message.deliver") {
        return Err(format!("unexpected event at B: {delivered}"));
    }
    println!("[{phase}] A->B message.deliver round-trip OK in {:?} (envelope id {msg_id})", rt0.elapsed());
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), String> {
    let dest = env("I2P_WS_TEST_DEST")?;
    let account_a = env("I2P_WS_TEST_ACCOUNT_A")?;
    let token_a = env("I2P_WS_TEST_TOKEN_A")?;
    let account_b = env("I2P_WS_TEST_ACCOUNT_B")?;
    let token_b = env("I2P_WS_TEST_TOKEN_B")?;

    // 1. Two authenticated sessions, each over its own I2P CONNECT tunnel.
    let stream_a = dial(&dest, &token_a, "A").await?;
    let stream_b = dial(&dest, &token_b, "B").await?;
    let (mut a_sink, mut a_source) = stream_a.split();
    let (mut b_sink, mut b_source) = stream_b.split();

    // 2. Real message round-trip between the two sessions.
    round_trip(&mut a_sink, &mut b_source, &account_a, &account_b, "pre-idle").await?;

    // 3. Idle survival on BOTH connections: poll both streams for IDLE_SECS so
    //    tungstenite auto-answers server pings (sent every 50s); any error or
    //    close during the window is a failure.
    let idle_deadline = tokio::time::sleep(Duration::from_secs(IDLE_SECS));
    tokio::pin!(idle_deadline);
    let (mut pings_a, mut pings_b) = (0u32, 0u32);
    loop {
        tokio::select! {
            _ = &mut idle_deadline => break,
            msg = a_source.next() => match msg {
                Some(Ok(Message::Ping(_))) => { pings_a += 1; println!("    [A] server ping (auto-pong)"); }
                Some(Ok(_)) => {}
                Some(Err(e)) => return Err(format!("[A] died during idle: {e}")),
                None => return Err("[A] closed during idle".to_string()),
            },
            msg = b_source.next() => match msg {
                Some(Ok(Message::Ping(_))) => { pings_b += 1; println!("    [B] server ping (auto-pong)"); }
                Some(Ok(_)) => {}
                Some(Err(e)) => return Err(format!("[B] died during idle: {e}")),
                None => return Err("[B] closed during idle".to_string()),
            },
        }
    }
    println!("[idle] both connections survived {IDLE_SECS}s (pings: A={pings_a}, B={pings_b})");

    // 4. Post-idle round-trip proves neither side silently dropped.
    round_trip(&mut a_sink, &mut b_source, &account_a, &account_b, "post-idle").await?;

    let _ = a_sink.close().await;
    let _ = b_sink.close().await;
    println!("PASS: 2x upgrade 101, A->B round-trip, {IDLE_SECS}s idle, post-idle A->B round-trip");
    Ok(())
}
