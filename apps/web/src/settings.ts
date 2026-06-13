// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// v1.5 client preferences: connection mode, cover-traffic intensity, and privacy
// view. These are UI-layer settings — they never touch the crypto or the message
// envelope. Persisted in localStorage; they carry no key material, no message
// content, and nothing that reveals vault count or existence.

import {
  CONNECTION_MODES,
  DEFAULT_CONNECTION_MODE,
  DEFAULT_PRIVACY_VIEW,
  privacyViewActive,
  type ConnectionMode,
  type CoverTrafficIntensity,
  type PrivacyViewSettings,
  type RevealMode,
  type TransportState,
} from "@sublemonable/protocol";
import { isTauri } from "@sublemonable/crypto";
import { create } from "zustand";

const STORAGE_KEY = "sublemonable.settings.v1_5";

interface PersistedSettings {
  connectionMode: ConnectionMode;
  coverTraffic: CoverTrafficIntensity;
  privacyView: PrivacyViewSettings;
}

function load(): PersistedSettings {
  const fallback: PersistedSettings = {
    connectionMode: DEFAULT_CONNECTION_MODE,
    coverTraffic: CONNECTION_MODES[DEFAULT_CONNECTION_MODE].decoyIntensity,
    privacyView: DEFAULT_PRIVACY_VIEW,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<PersistedSettings>) };
  } catch {
    return fallback;
  }
}

function save(s: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — settings stay in memory only */
  }
}

interface SettingsState extends PersistedSettings {
  /** Live transport state — Tor is the default; clearnet is a flagged fallback. */
  transport: TransportState;
  setConnectionMode: (mode: ConnectionMode) => void;
  setCoverTraffic: (intensity: CoverTrafficIntensity) => void;
  setTransport: (transport: TransportState) => void;
  setGlobalPrivacyView: (on: boolean) => void;
  setRevealMode: (mode: RevealMode) => void;
  setTapTimedSeconds: (seconds: number) => void;
  togglePrivacyForConversation: (peerId: string) => void;
  isPrivacyActive: (peerId: string) => boolean;
}

export const useSettings = create<SettingsState>((set, get) => {
  const initial = load();
  const persist = () => {
    const { connectionMode, coverTraffic, privacyView } = get();
    save({ connectionMode, coverTraffic, privacyView });
  };

  return {
    ...initial,
    // A browser reaches the server over HTTPS/WSS; true Tor routing means using
    // the Tor Browser with the deployment's .onion address. We surface Tor as
    // active when the page is served from an .onion host, else a clearnet
    // fallback — honest about the browser's limits.
    transport:
      typeof location !== "undefined" && location.hostname.endsWith(".onion")
        ? "tor"
        : "clearnet_fallback",

    setConnectionMode(mode) {
      // Selecting a mode sets its bundled cover-traffic intensity too.
      set({ connectionMode: mode, coverTraffic: CONNECTION_MODES[mode].decoyIntensity });
      persist();
    },
    setCoverTraffic(intensity) {
      set({ coverTraffic: intensity });
      persist();
    },
    setTransport(transport) {
      set({ transport });
    },
    setGlobalPrivacyView(on) {
      set((s) => ({ privacyView: { ...s.privacyView, globalEnabled: on } }));
      persist();
    },
    setRevealMode(mode) {
      set((s) => ({ privacyView: { ...s.privacyView, revealMode: mode } }));
      persist();
    },
    setTapTimedSeconds(seconds) {
      set((s) => ({ privacyView: { ...s.privacyView, tapTimedSeconds: seconds } }));
      persist();
    },
    togglePrivacyForConversation(peerId) {
      set((s) => {
        const current = privacyViewActive(s.privacyView, peerId);
        return {
          privacyView: {
            ...s.privacyView,
            perConversation: { ...s.privacyView.perConversation, [peerId]: !current },
          },
        };
      });
      persist();
    },
    isPrivacyActive(peerId) {
      return privacyViewActive(get().privacyView, peerId);
    },
  };
});

// In the Tauri desktop app the Rust backend probes for a local Tor SOCKS proxy
// on startup and emits `connection-mode-changed` ({ mode: "tor" | "clearnet" }).
// Mirror it into the transport state so the connection-mode badge reflects real
// routing — in a browser this listener is never registered and the existing
// `.onion`-hostname heuristic stands.
if (isTauri()) {
  interface TauriEventApi {
    listen: (
      event: string,
      handler: (event: { payload: { mode?: string } }) => void,
    ) => Promise<unknown>;
  }
  const tauri = (window as unknown as { __TAURI__?: { event?: TauriEventApi } }).__TAURI__;
  void tauri?.event
    ?.listen("connection-mode-changed", (event) => {
      const transport: TransportState = event.payload?.mode === "tor" ? "tor" : "clearnet_fallback";
      useSettings.getState().setTransport(transport);
    })
    .catch(() => {
      /* event bridge unavailable — keep the default transport state */
    });
}
