// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Dedicated Web Worker that runs the plausible-deniability vault unlock off the
// main thread. The vault derives Argon2id once PER key slot (deliberately, for
// maximal isolation), which is CPU-heavy; running it here keeps the render
// thread responsive while every slot is still tried with identical timing.

import { tryPassphrase, type KeySlot, type VaultUnlock } from "@sublemonable/crypto";

// Typed locally to avoid DOM/WebWorker lib clashes in the shared tsconfig.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
};

interface UnlockRequest {
  passphrase: string;
  slots: KeySlot[];
}

ctx.onmessage = (e: MessageEvent) => {
  const { passphrase, slots } = e.data as UnlockRequest;
  void (async () => {
    try {
      const result: VaultUnlock | null = await tryPassphrase(passphrase, slots);
      ctx.postMessage({ ok: true, result });
    } catch {
      ctx.postMessage({ ok: false });
    }
  })();
};
