// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { CLEARNET_WARNING, type TransportResolution } from "@sublemonable/protocol";

/**
 * Resolves the active transport by probing in a fixed fallback-chain order —
 * this is not user-selectable (see docs/TOR_ARCHITECTURE.md):
 *
 *   1. I2P      — live on Linux desktop (Tauri) when i2pd is running; skeleton on
 *                 mobile (no SDK) and browser (no proxy control).
 *   2. Tor      — detected by .onion hostname (browser) or Tauri SOCKS proxy probe.
 *   3. Clearnet — last resort, shown with a warning banner unless fallback is off.
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
  if (await detectI2P(isTauriApp)) return { transport: "i2p", showClearnetWarning: false };
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
 * I2P detection.
 *
 * On the Tauri (Linux desktop) path: invokes `check_i2p_connectivity`, which
 * does a TCP probe of 127.0.0.1:4444 (the i2pd default HTTP proxy) with a
 * 5-second timeout. Returns true if i2pd is running and accepting connections.
 *
 * On the browser path: always returns false — browser JS cannot control proxy
 * settings, so there is no way to route .b32.i2p traffic from here.
 *
 * On mobile (iOS, Android): always returns false — no in-process I2P router SDK
 * exists yet; the chain falls through to Tor. See docs/V1_5_STATUS.md.
 */
async function detectI2P(isTauriApp: boolean): Promise<boolean> {
  if (typeof location !== "undefined" && location.hostname.endsWith(".b32.i2p")) {
    return true; // reached via an I2P browser (rare but valid)
  }
  if (isTauriApp) {
    try {
      const invoke = (
        window as unknown as {
          __TAURI__?: { core?: { invoke?: (cmd: string) => Promise<unknown> } };
        }
      ).__TAURI__?.core?.invoke;
      if (!invoke) return false;
      return (await invoke("check_i2p_connectivity")) as boolean;
    } catch {
      return false;
    }
  }
  return false;
}
