// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import { LemonSlice, LemonSpinner, SublemonableStyles } from "@sublemonable/ui";
import { ScreenshotShield, useDevToolsWarning } from "./components/ScreenshotShield.js";
import { ChatList } from "./screens/ChatList.js";
import { ChatView } from "./screens/ChatView.js";
import { Gate } from "./screens/Gate.js";
import { Settings } from "./screens/Settings.js";
import { VerifyKeys } from "./screens/VerifyKeys.js";
import { useApp } from "./store.js";

export default function App() {
  const phase = useApp((s) => s.phase);
  const bootstrap = useApp((s) => s.bootstrap);
  const activePeer = useApp((s) => s.activePeer);
  const devTools = useDevToolsWarning();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [verifyPeer, setVerifyPeer] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <div className="relative h-full">
      <SublemonableStyles />

      {devTools && phase === "ready" && (
        <div role="alert" className="flex items-center justify-center gap-2 bg-burn-orange px-4 py-1.5 text-xs font-medium text-bg-primary">
          Developer tools appear to be open. Anything on screen can be read by extensions or
          inspected — close DevTools for sensitive conversations.
        </div>
      )}

      {phase === "loading" && (
        <div className="flex h-full items-center justify-center">
          <LemonSpinner size={64} />
        </div>
      )}

      {(phase === "setup" || phase === "unlock") && <Gate mode={phase} />}

      {phase === "ready" && (
        <main className="flex h-full">
          <ChatList onOpenSettings={() => setSettingsOpen(true)} />
          {activePeer ? (
            <ChatView peerId={activePeer} onVerify={() => setVerifyPeer(activePeer)} />
          ) : (
            <section className="flex flex-1 flex-col items-center justify-center gap-4 bg-bg-primary">
              <LemonSlice variant="logo_mark" size={96} />
              <p className="font-display text-lg text-ink-secondary">Nothing lasts. That's the point.</p>
            </section>
          )}
          <ScreenshotShield />
        </main>
      )}

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      {verifyPeer && <VerifyKeys peerId={verifyPeer} onClose={() => setVerifyPeer(null)} />}
    </div>
  );
}
