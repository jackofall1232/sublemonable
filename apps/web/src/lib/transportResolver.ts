// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { CLEARNET_WARNING, type TransportResolution } from "@sublemonable/protocol";

/**
 * Resolves the active transport by probing in a fixed fallback-chain order —
 * this is not user-selectable (see docs/TOR_ARCHITECTURE.md):
 *
 *   1. I2P      (skeleton — always fails in v1.5, logs intent)
 *   2. Tor      (detected by .onion hostname or Tauri proxy probe)
 *   3. Clearnet (last resort — always succeeds unless offline / fallback disabled)
 *
 * In v1.5, I2P detection always returns false, so the chain falls through to
 * Tor correctly. The chain is wired so enabling I2P in a future release
 * requires only implementing detectI2P().
 *
 * When `allowClearnetFallback` is false the resolver refuses to fall back to
 * clearnet and reports "offline" instead — the app then shows a "connection
 * refused" state rather than the warning banner (see Settings → Network).
 */
export async function resolveTransport(
  isTauriApp: boolean,
  allowClearnetFallback = true,
): Promise<TransportResolution> {
  // Probe lazily in fallback-chain order so each branch only does the work its
  // chain requires (and matches the documented order; see docs/TOR_ARCHITECTURE.md).
  if (await detectI2P()) return { transport: "i2p", showClearnetWarning: false };
  if (await detectTor(isTauriApp)) return { transport: "tor", showClearnetWarning: false };
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
    // null — a non-null config means Tor routing is active. Read the injected
    // Tauri global directly rather than dynamically importing
    // @tauri-apps/api/core, which can break the pure web build under Vite/Rollup.
    try {
      const invoke = (
        window as unknown as {
          __TAURI__?: { core?: { invoke?: (cmd: string) => Promise<unknown> } };
        }
      ).__TAURI__?.core?.invoke;
      if (!invoke) return false;
      const result = (await invoke("get_proxy_config")) as { host: string; port: number } | null;
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
