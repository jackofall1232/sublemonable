// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Main-thread side of the vault unlock. Spawns the worker, hands it the
// passphrase and key slots, and resolves with the unlocked vault key (or null
// for a wrong passphrase). Per-slot Argon2id is intentionally expensive for
// isolation; doing it in a worker keeps the UI from freezing during unlock.

import type { KeySlot, VaultUnlock } from "@sublemonable/crypto";

export function unlockVaultOffThread(
  passphrase: string,
  slots: KeySlot[],
): Promise<VaultUnlock | null> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./vault.worker.ts", import.meta.url), { type: "module" });
    const finish = (fn: () => void) => {
      worker.terminate();
      fn();
    };
    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as { ok: boolean; result?: VaultUnlock | null };
      finish(() =>
        data.ok ? resolve(data.result ?? null) : reject(new Error("vault unlock failed")),
      );
    };
    worker.onerror = () => finish(() => reject(new Error("vault worker error")));
    worker.postMessage({ passphrase, slots });
  });
}
