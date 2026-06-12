// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import type { ClientEvent, ServerEvent } from "@sublemonable/protocol";
import { WS_URL } from "./api.js";

export type WsStatus = "connecting" | "open" | "closed";

/**
 * Authenticated WebSocket with reconnect backoff. The JWT rides the
 * Sec-WebSocket-Protocol header (the browser WebSocket API can't set
 * Authorization). Messages composed while offline queue in memory only.
 */
export class WsClient {
  private socket: WebSocket | null = null;
  private queue: ClientEvent[] = [];
  private backoffMs = 500;
  private closedByUs = false;

  constructor(
    private readonly getToken: () => Promise<string>,
    private readonly onEvent: (event: ServerEvent) => void,
    private readonly onStatus: (status: WsStatus) => void,
  ) {}

  async connect(): Promise<void> {
    this.closedByUs = false;
    this.onStatus("connecting");
    const token = await this.getToken();
    const socket = new WebSocket(WS_URL, [token]);
    this.socket = socket;

    socket.onopen = () => {
      this.backoffMs = 500;
      this.onStatus("open");
      for (const ev of this.queue.splice(0)) this.send(ev);
    };
    socket.onmessage = (msg) => {
      try {
        this.onEvent(JSON.parse(msg.data as string) as ServerEvent);
      } catch {
        // Malformed frame — drop it; never log payloads.
      }
    };
    socket.onclose = () => {
      this.onStatus("closed");
      if (!this.closedByUs) this.scheduleReconnect();
    };
    socket.onerror = () => socket.close();
  }

  send(event: ClientEvent): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(event));
    } else {
      this.queue.push(event);
    }
  }

  close(): void {
    this.closedByUs = true;
    this.socket?.close();
  }

  private scheduleReconnect(): void {
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    setTimeout(() => {
      if (!this.closedByUs) void this.connect();
    }, delay);
  }
}
