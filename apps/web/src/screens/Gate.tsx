// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import { PassphraseSetup } from "@sublemonable/ui";
import { useApp } from "../store.js";

/** Passphrase gate: account creation (multi-vault image) or unlock. */
export function Gate({ mode }: { mode: "setup" | "unlock" }) {
  const createAccount = useApp((s) => s.createAccount);
  const unlock = useApp((s) => s.unlock);
  const resetDevice = useApp((s) => s.resetDevice);
  const unlockError = useApp((s) => s.unlockError);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [resetArmed, setResetArmed] = useState(false);

  return (
    <div className="relative h-full">
      <PassphraseSetup
        mode={mode}
        busy={busy}
        error={error ?? unlockError}
        onSubmit={(passphrase) => {
          setBusy(true);
          setError(undefined);
          void (mode === "setup" ? createAccount(passphrase) : unlock(passphrase))
            .catch(() =>
              setError(mode === "setup" ? "Could not reach the server" : "Wrong passphrase"),
            )
            .finally(() => setBusy(false));
        }}
      />

      {/* Escape hatch: the image can't reveal whether any unlockable vault
          remains (that's the point), so a user whose vault is gone — deleted
          account, forgotten passphrase — needs an always-present way back to
          setup. Erases the ENTIRE image, every vault; hence the arm/confirm
          double step. */}
      {mode === "unlock" && !busy && (
        <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2 text-center">
          {resetArmed ? (
            <>
              <p className="text-xs text-ink-secondary">
                This erases everything stored on this device — every vault, permanently.
              </p>
              <div className="flex gap-4">
                <button
                  type="button"
                  className="text-xs font-medium text-burn-orange underline"
                  onClick={() => {
                    setResetArmed(false);
                    void resetDevice().catch(() => setError("Reset failed — try again"));
                  }}
                >
                  Erase and start over
                </button>
                <button
                  type="button"
                  className="text-xs text-ink-secondary underline"
                  onClick={() => setResetArmed(false)}
                >
                  Keep my data
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="text-xs text-ink-secondary underline"
              onClick={() => setResetArmed(true)}
            >
              Forgot your passphrase? Reset this device
            </button>
          )}
        </div>
      )}
    </div>
  );
}
