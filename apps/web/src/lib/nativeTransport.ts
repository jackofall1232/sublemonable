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

/** Pinned HTTPS request via the native client. */
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
