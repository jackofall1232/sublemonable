// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import { useApp } from "../store.js";

export function Settings({ onClose }: { onClose: () => void }) {
  const accountId = useApp((s) => s.accountId);
  const wsStatus = useApp((s) => s.wsStatus);
  const lock = useApp((s) => s.lock);
  const deleteAccount = useApp((s) => s.deleteAccount);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70" role="dialog" aria-modal>
      <div className="flex w-full max-w-md flex-col gap-6 rounded-xl border border-line bg-bg-secondary p-8">
        <h2 className="font-display text-xl font-semibold text-ink-primary">Settings</h2>

        <Section title="Security">
          <Row label="Passphrase" value="Set — required on every unlock" />
          <button onClick={lock} className="self-start rounded-full bg-bg-elevated px-4 py-1.5 text-sm text-lemon hover:bg-rind">
            Lock now
          </button>
        </Section>

        <Section title="Account">
          <Row label="Your ID" value={accountId ?? "—"} mono />
          <Row label="Identity key" value="Generated on this device. It never leaves it." />
        </Section>

        <Section title="Network">
          <Row label="Connection" value={wsStatus === "open" ? "Connected (WSS)" : wsStatus} />
          <Row label="Tor routing" value="Use the Tor Browser with your server's .onion address" />
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
                <button onClick={() => setConfirmDelete(false)} className="rounded-full px-3 text-sm text-ink-secondary">
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

        <button onClick={onClose} className="self-end rounded-full px-4 py-2 text-sm text-ink-secondary hover:text-ink-primary">
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
      <span className={`text-right text-sm text-ink-primary ${mono ? "select-text break-all font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}
