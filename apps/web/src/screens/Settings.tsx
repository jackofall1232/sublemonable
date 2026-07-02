// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import { CONNECTION_MODES, type ConnectionMode, type RevealMode } from "@sublemonable/protocol";
import { useApp } from "../store.js";
import { useSettings } from "../settings.js";

const MODES: ConnectionMode[] = ["standard", "stealth", "ghost"];
const COVER: Array<"off" | "low" | "medium" | "high"> = ["off", "low", "medium", "high"];
const REVEAL: Array<{ id: RevealMode; label: string }> = [
  { id: "hold_to_reveal", label: "Hold to reveal" },
  { id: "tap_timed", label: "Tap (timed)" },
  { id: "tap_toggle", label: "Tap to toggle" },
];

export function Settings({ onClose }: { onClose: () => void }) {
  const accountId = useApp((s) => s.accountId);
  const wsStatus = useApp((s) => s.wsStatus);
  const lock = useApp((s) => s.lock);
  const deleteAccount = useApp((s) => s.deleteAccount);
  const redeemDeadDrop = useApp((s) => s.redeemDeadDrop);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [redeemToken, setRedeemToken] = useState("");
  const [redeemStatus, setRedeemStatus] = useState<string | null>(null);

  const connectionMode = useSettings((s) => s.connectionMode);
  const coverTraffic = useSettings((s) => s.coverTraffic);
  const transport = useSettings((s) => s.transport);
  const allowClearnetFallback = useSettings((s) => s.allowClearnetFallback);
  const privacyView = useSettings((s) => s.privacyView);
  const setConnectionMode = useSettings((s) => s.setConnectionMode);
  const setCoverTraffic = useSettings((s) => s.setCoverTraffic);
  const setAllowClearnetFallback = useSettings((s) => s.setAllowClearnetFallback);
  const setGlobalPrivacyView = useSettings((s) => s.setGlobalPrivacyView);
  const setRevealMode = useSettings((s) => s.setRevealMode);

  const onRedeem = () => {
    setRedeemStatus("Redeeming…");
    void redeemDeadDrop(redeemToken)
      .then(() => {
        setRedeemStatus("Delivered — check the conversation.");
        setRedeemToken("");
      })
      .catch(() => setRedeemStatus("No drop found — token may be used, expired, or wrong."));
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70"
      role="dialog"
      aria-modal
    >
      <div className="flex w-full max-w-md flex-col gap-6 rounded-xl border border-line bg-bg-secondary p-8">
        <h2 className="font-display text-xl font-semibold text-ink-primary">Settings</h2>

        <Section title="Security">
          <Row label="Passphrase" value="Set — required on every unlock" />
          <button
            onClick={lock}
            className="self-start rounded-full bg-bg-elevated px-4 py-1.5 text-sm text-lemon hover:bg-rind"
          >
            Lock now
          </button>
        </Section>

        <Section title="Account">
          <Row label="Your ID" value={accountId ?? "—"} mono />
          <Row label="Identity key" value="Generated on this device. It never leaves it." />
        </Section>

        <Section title="Network">
          <Row label="Connection" value={wsStatus === "open" ? "Connected (WSS)" : wsStatus} />
          <Row
            label="Transport"
            value={
              transport === "i2p"
                ? "I2P active"
                : transport === "tor"
                  ? "Tor active (.onion) — I2P unavailable"
                  : transport === "clearnet_fallback"
                    ? "Clearnet fallback — open in Tor Browser via .onion for Tor"
                    : allowClearnetFallback
                      ? "Offline"
                      : "I2P and Tor unavailable — connection refused (clearnet fallback disabled)"
            }
          />
          <div className="flex flex-col gap-1">
            <span className="text-sm text-ink-secondary">Connection mode</span>
            <div className="flex gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setConnectionMode(m)}
                  className={`rounded-full px-3 py-1 text-xs capitalize ${connectionMode === m ? "bg-lemon text-ink-on-lemon" : "border border-line text-ink-secondary hover:text-lemon"}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-muted">{CONNECTION_MODES[connectionMode].description}</p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-ink-secondary">Cover traffic</span>
            <div className="flex gap-2">
              {COVER.map((c) => (
                <button
                  key={c}
                  onClick={() => setCoverTraffic(c)}
                  className={`rounded-full px-3 py-1 text-xs capitalize ${coverTraffic === c ? "bg-lemon text-ink-on-lemon" : "border border-line text-ink-secondary hover:text-lemon"}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-muted">
              Continuous decoy traffic makes a real send indistinguishable from idle. Higher levels
              use more battery.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink-secondary">
                Fallback to clearnet if anonymous transport fails
              </span>
              <button
                onClick={() => setAllowClearnetFallback(!allowClearnetFallback)}
                aria-pressed={allowClearnetFallback}
                className={`rounded-full px-3 py-1 text-xs ${allowClearnetFallback ? "bg-lemon text-ink-on-lemon" : "border border-line text-ink-secondary"}`}
              >
                {allowClearnetFallback ? "On" : "Off"}
              </button>
            </div>
            <p className="text-xs text-ink-muted">
              {allowClearnetFallback
                ? "When Tor and I2P are both unavailable, the app connects over clearnet and shows a warning."
                : "Disabling clearnet fallback may make the app unusable if Tor is blocked or slow. Only disable this if you are certain Tor is reliable on your network."}
            </p>
          </div>
        </Section>

        <Section title="Privacy">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-ink-secondary">Privacy view (blur until revealed)</span>
            <button
              onClick={() => setGlobalPrivacyView(!privacyView.globalEnabled)}
              aria-pressed={privacyView.globalEnabled}
              className={`rounded-full px-3 py-1 text-xs ${privacyView.globalEnabled ? "bg-lemon text-ink-on-lemon" : "border border-line text-ink-secondary"}`}
            >
              {privacyView.globalEnabled ? "On" : "Off"}
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-ink-secondary">Reveal mode</span>
            <div className="flex gap-2">
              {REVEAL.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRevealMode(r.id)}
                  className={`rounded-full px-3 py-1 text-xs ${privacyView.revealMode === r.id ? "bg-lemon text-ink-on-lemon" : "border border-line text-ink-secondary hover:text-lemon"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Dead drop">
          <p className="text-xs text-ink-muted">
            Redeem a one-time dead-drop token shared with you out of band. It works once.
          </p>
          <div className="flex gap-2">
            <input
              value={redeemToken}
              onChange={(e) => setRedeemToken(e.target.value)}
              placeholder="Paste drop token"
              className="flex-1 rounded-md border border-line bg-bg-primary px-3 py-1.5 font-mono text-xs text-ink-primary outline-none focus:border-lemon"
            />
            <button
              onClick={onRedeem}
              disabled={!redeemToken.trim()}
              className="rounded-full bg-lemon px-4 py-1.5 text-sm font-medium text-ink-on-lemon disabled:opacity-50"
            >
              Redeem
            </button>
          </div>
          {redeemStatus && <p className="text-xs text-ink-secondary">{redeemStatus}</p>}
        </Section>

        <Section title="Appearance">
          <Row label="Theme" value="Dark (only option — you're welcome)" />
        </Section>

        <Section title="Danger">
          {confirmDelete ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-burn-red">
                This purges everything — keys, pending messages, the account record. Irreversible.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void deleteAccount()}
                  className="rounded-full bg-burn-red px-4 py-1.5 text-sm font-medium text-bg-primary"
                >
                  Delete forever
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full px-3 text-sm text-ink-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="self-start rounded-full border border-burn-red px-4 py-1.5 text-sm text-burn-red hover:bg-burn-red hover:text-bg-primary"
            >
              Delete account
            </button>
          )}
        </Section>

        <button
          onClick={onClose}
          className="self-end rounded-full px-4 py-2 text-sm text-ink-secondary hover:text-ink-primary"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs uppercase tracking-widest text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-ink-secondary">{label}</span>
      <span
        className={`text-right text-sm text-ink-primary ${mono ? "select-text break-all font-mono text-xs" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
