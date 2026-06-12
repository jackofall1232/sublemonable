// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import { PassphraseSetup } from "@sublemonable/ui";
import { useApp } from "../store.js";

/** Passphrase gate: account creation (Argon2id keystore) or unlock. */
export function Gate({ mode }: { mode: "setup" | "unlock" }) {
  const createAccount = useApp((s) => s.createAccount);
  const unlock = useApp((s) => s.unlock);
  const unlockError = useApp((s) => s.unlockError);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <PassphraseSetup
      mode={mode}
      busy={busy}
      error={error ?? unlockError}
      onSubmit={(passphrase) => {
        setBusy(true);
        setError(undefined);
        void (mode === "setup" ? createAccount(passphrase) : unlock(passphrase))
          .catch(() => setError(mode === "setup" ? "Could not reach the server" : "Wrong passphrase"))
          .finally(() => setBusy(false));
      }}
    />
  );
}
