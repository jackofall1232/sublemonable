// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Native (Tauri) transport bridge.
 *
 * In the browser PWA this module is inert — {@link isTauri} is false and nothing
 * here runs, so the plain `fetch`/`WebSocket` paths are used unchanged. In the
 * desktop bundle the WebView can't pin TLS, so REST and WebSocket traffic is
 * routed through the native Rust commands in `apps/desktop/src-tauri` whose
 * rustls client enforces the certificate pin. `@tauri-apps/api` is imported
 * lazily so the browser build never bundles or requires it.
 */

/** True only when running inside the Tauri desktop shell. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Lazy import keeps `@tauri-apps/api` out of the browser bundle graph.
async function core(): Promise<typeof import("@tauri-apps/api/core")> {
  return import("@tauri-apps/api/core");
}

export interface NativeHttpResponse {
  status: number;
  body: string;
}

/** Pinned HTTPS request via the native client (clearnet / Tor paths). */
export async function nativeRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<NativeHttpResponse> {
  const { invoke } = await core();
  return invoke<NativeHttpResponse>("pinned_request", {
    method,
    url,
    headers,
    body: body ?? null,
  });
}

/**
 * I2P request via the native client. Routes through the local i2pd HTTP proxy
 * at 127.0.0.1:4444; targets the relay I2P destination baked in at build time
 * (`RELAY_I2P_DEST`). Use `http://` URLs — I2P provides transport security.
 *
 * WebSocket connections over I2P are supported via `NativeI2pWsSocket`, which
 * uses the `ws_open_i2p` Tauri command implemented in i2p.rs.
 */
export async function i2pRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<NativeHttpResponse> {
  const { invoke } = await core();
  return invoke<NativeHttpResponse>("i2p_request", {
    method,
    url,
    headers,
    body: body ?? null,
  });
}

type WsEvent =
  | { kind: "open" }
  | { kind: "message"; data: string }
  | { kind: "closed"; reason: string };

/**
 * A minimal `WebSocket`-shaped wrapper over the native pinned WebSocket commands
 * (`ws_open`/`ws_send`/`ws_close`). It implements only the surface `WsClient`
 * uses — `readyState`, the `on*` handlers, `send`, `close` — and reuses the
 * standard `WebSocket.OPEN === 1` numeric state so the existing client logic is
 * unchanged.
 */
export class NativeWsSocket {
  static readonly OPEN = 1;
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  private id: number | null = null;
  private closed = false;
  private sendQueue: string[] = [];

  constructor(token: string) {
    void this.open(token);
  }

  private async open(token: string): Promise<void> {
    try {
      const { invoke, Channel } = await core();
      const channel = new Channel<WsEvent>();
      channel.onmessage = (ev: WsEvent) => {
        if (ev.kind === "open") {
          this.readyState = 1; // OPEN
          this.onopen?.();
        } else if (ev.kind === "message") {
          this.onmessage?.({ data: ev.data });
        } else {
          this.readyState = 3; // CLOSED
          this.onclose?.();
        }
      };
      const id = await invoke<number>("ws_open", { token, onEvent: channel });
      this.id = id;
      if (this.closed) {
        void this.close();
        return;
      }
      // Flush anything queued before the connection id arrived.
      for (const data of this.sendQueue.splice(0)) {
        void invoke("ws_send", { id, data });
      }
    } catch {
      this.readyState = 3;
      this.onerror?.();
      this.onclose?.();
    }
  }

  send(data: string): void {
    if (this.id == null) {
      this.sendQueue.push(data);
      return;
    }
    const id = this.id;
    void core().then(({ invoke }) => invoke("ws_send", { id, data }));
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
    const id = this.id;
    if (id != null) {
      void core().then(({ invoke }) => invoke("ws_close", { id }));
    }
  }
}

/**
 * A minimal `WebSocket`-shaped wrapper over the native I2P WebSocket commands
 * (`ws_open_i2p`/`ws_send`/`ws_close`).
 *
 * Connections are established by tunneling through the local i2pd HTTP proxy at
 * 127.0.0.1:4444 via HTTP CONNECT to the target `.b32.i2p` destination. Because
 * I2P provides its own transport-layer encryption, the Rust side uses a `ws://`
 * URL rather than `wss://` — adding TLS on top of I2P is redundant and i2pd's
 * HTTP proxy does not support CONNECT-then-TLS to garlic destinations.
 *
 * Verified end-to-end on 2026-07-02 against a live i2pd + relay server tunnel:
 * i2pd's HTTP proxy accepts `CONNECT <b32>:80`, two authenticated sessions
 * upgraded (101), a message round-tripped, and both connections survived 60s
 * idle across a server ping cycle.
 *
 * The `token` passed here is forwarded to the `ws_open_i2p` Tauri command, which
 * puts it in the `?token=` query param (the server's native-client auth path),
 * NOT `Sec-WebSocket-Protocol`. The Rust WebSocket client (tungstenite) fails
 * the handshake when it requests a subprotocol the server does not echo back,
 * which the browser `WebSocket` tolerates but tungstenite does not.
 *
 * {@link NativeWsSocket} (the clearnet/Tor `ws_open` command) uses the same
 * `?token=` query-param auth for the same reason — only the browser `WebSocket`
 * path keeps the subprotocol header.
 *
 * Implements the same `WsClient` surface as {@link NativeWsSocket} —
 * `readyState`, the `on*` handlers, `send`, `close` — so it is a drop-in
 * replacement for the I2P transport path.
 */
export class NativeI2pWsSocket {
  static readonly OPEN = 1;
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  private id: number | null = null;
  private closed = false;
  private sendQueue: string[] = [];

  constructor(token: string) {
    void this.open(token);
  }

  private async open(token: string): Promise<void> {
    try {
      const { invoke, Channel } = await core();
      const channel = new Channel<WsEvent>();
      channel.onmessage = (ev: WsEvent) => {
        if (ev.kind === "open") {
          this.readyState = 1; // OPEN
          this.onopen?.();
        } else if (ev.kind === "message") {
          this.onmessage?.({ data: ev.data });
        } else {
          this.readyState = 3; // CLOSED
          this.onclose?.();
        }
      };
      const id = await invoke<number>("ws_open_i2p", { token, onEvent: channel });
      this.id = id;
      if (this.closed) {
        void this.close();
        return;
      }
      // Flush anything queued before the connection id arrived.
      for (const data of this.sendQueue.splice(0)) {
        void invoke("ws_send", { id, data });
      }
    } catch {
      this.readyState = 3;
      this.onerror?.();
      this.onclose?.();
    }
  }

  send(data: string): void {
    if (this.id == null) {
      this.sendQueue.push(data);
      return;
    }
    const id = this.id;
    void core().then(({ invoke }) => invoke("ws_send", { id, data }));
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
    const id = this.id;
    if (id != null) {
      void core().then(({ invoke }) => invoke("ws_close", { id }));
    }
  }
}
