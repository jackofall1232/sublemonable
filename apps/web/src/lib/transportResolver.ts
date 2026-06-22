// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import {
  CLEARNET_WARNING,
  type PreferredTransport,
  type TransportResolution,
} from "@sublemonable/protocol";

/**
 * Resolves the active transport by probing in fallback-chain order.
 *
 * Chain when preferredTransport === "tor_first":
 *   1. Tor (detected by .onion hostname or Tauri proxy probe)
 *   2. I2P (skeleton — always fails in v1.5)
 *   3. Clearnet (last resort — always succeeds unless offline / fallback disabled)
 *
 * Chain when preferredTransport === "i2p_first":
 *   1. I2P (skeleton — always fails in v1.5, logs intent)
 *   2. Tor
 *   3. Clearnet
 *
 * In v1.5, I2P detection always returns false. The chain is wired correctly so
 * enabling I2P in a future release requires only implementing detectI2P().
 *
 * When `allowClearnetFallback` is false the resolver refuses to fall back to
 * clearnet and reports "offline" instead — the app then shows a "connection
 * refused" state rather than the warning banner (see Settings → Network).
 */
export async function resolveTransport(
  preferred: PreferredTransport,
  isTauriApp: boolean,
  allowClearnetFallback = true,
): Promise<TransportResolution> {
  const torActive = await detectTor(isTauriApp);
  const i2pActive = await detectI2P(); // always false in v1.5

  if (preferred === "tor_first") {
    if (torActive) return { transport: "tor", showClearnetWarning: false };
    if (i2pActive) return { transport: "i2p", showClearnetWarning: false };
    return clearnetOrOffline(allowClearnetFallback);
  }

  // i2p_first
  if (i2pActive) return { transport: "i2p", showClearnetWarning: false };
  if (torActive) {
    // I2P was preferred but unavailable; Tor is still an anonymous transport, so
    // this is an info-level fallback, not a security warning (no banner).
    return { transport: "tor", showClearnetWarning: false };
  }
  return clearnetOrOffline(allowClearnetFallback);
}

/** Last leg of either chain: warned clearnet, or "offline" if fallback is off. */
function clearnetOrOffline(allowClearnetFallback: boolean): TransportResolution {
  if (!allowClearnetFallback) {
    return { transport: "offline", showClearnetWarning: false };
  }
  return {
    transport: "clearnet_fallback",
    showClearnetWarning: true,
    fallbackReason: CLEARNET_WARNING.body,
  };
}

/** Tor detection: .onion hostname (browser) or Tauri proxy probe result. */
async function detectTor(isTauriApp: boolean): Promise<boolean> {
  if (typeof location !== "undefined" && location.hostname.endsWith(".onion")) {
    return true;
  }
  if (isTauriApp) {
    // The Rust backend probes for a local Tor SOCKS proxy on startup and stores
    // the result. get_proxy_config returns the active proxy ({ host, port }) or
    // null — a non-null config means Tor routing is active.
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ host: string; port: number } | null>("get_proxy_config");
      return result != null;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * I2P detection — skeleton only in v1.5.
 *
 * INTENT (future): probe a local I2P HTTP proxy (typically 127.0.0.1:4444) or an
 * I2P SAM bridge. If reachable, route WebSocket and REST traffic through it to
 * the relay's I2P destination address.
 *
 * In v1.5 this always returns false. The function signature and call site are in
 * place so future implementation requires no structural changes.
 */
async function detectI2P(): Promise<boolean> {
  // TODO(i2p-v2): probe 127.0.0.1:4444 or SAM bridge
  return false;
}
