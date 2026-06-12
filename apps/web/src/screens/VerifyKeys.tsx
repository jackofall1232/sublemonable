// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import { KeyFingerprintDisplay, LemonSpinner } from "@sublemonable/ui";
import { useApp } from "../store.js";

export function VerifyKeys({ peerId, onClose }: { peerId: string; onClose: () => void }) {
  const contact = useApp((s) => s.contacts[peerId]);
  const getSafetyNumber = useApp((s) => s.getSafetyNumber);
  const markVerified = useApp((s) => s.markVerified);
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  useEffect(() => {
    void getSafetyNumber(peerId).then(setFingerprint);
  }, [peerId, getSafetyNumber]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70" role="dialog" aria-modal>
      <div className="flex max-w-md flex-col items-center gap-5 rounded-xl border border-line bg-bg-secondary p-8">
        <h2 className="font-display text-xl font-semibold text-ink-primary">
          Verify {contact?.displayName}
        </h2>
        <p className="text-center text-sm text-ink-secondary">
          Compare this Safety Number with {contact?.displayName} over a channel you trust — in
          person is best. If it matches on both screens, your encryption has no one in the middle.
        </p>
        {fingerprint ? <KeyFingerprintDisplay fingerprint={fingerprint} /> : <LemonSpinner />}
        <div className="flex gap-3">
          <button
            onClick={() => {
              void markVerified(peerId);
              onClose();
            }}
            className="rounded-full bg-lemon px-6 py-2 text-sm font-medium text-ink-on-lemon hover:bg-lemon-bright"
          >
            They match — mark verified
          </button>
          <button onClick={onClose} className="rounded-full px-4 py-2 text-sm text-ink-secondary hover:text-ink-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
