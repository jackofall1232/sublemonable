// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import { ConversationList, LemonSlice } from "@sublemonable/ui";
import { isUuid } from "@sublemonable/protocol";
import { useApp } from "../store.js";

export function ChatList({ onOpenSettings }: { onOpenSettings: () => void }) {
  const contacts = useApp((s) => s.contacts);
  const keyStore = useApp((s) => s.keyStore);
  const messages = useApp((s) => s.messages);
  const activePeer = useApp((s) => s.activePeer);
  const setActivePeer = useApp((s) => s.setActivePeer);
  const addContact = useApp((s) => s.addContact);
  const accountId = useApp((s) => s.accountId);
  const [adding, setAdding] = useState(false);
  const [peerId, setPeerId] = useState("");
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string | undefined>();

  const conversations = Object.entries(contacts).map(([id, c]) => ({
    id,
    displayName: c.displayName,
    verified: keyStore?.verifiedContacts[id] === c.identityKey,
    unreadCount: (messages[id] ?? []).filter((m) => m.direction === "received" && !m.opened).length,
  }));

  return (
    <aside className="flex h-full w-80 flex-col border-r border-line bg-bg-primary">
      <header className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <LemonSlice variant="logo_mark" size={26} />
          <span className="font-display text-lg font-bold tracking-wide text-lemon">SUBLEMONABLE</span>
        </div>
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="text-ink-secondary transition-colors hover:text-lemon"
        >
          ⚙
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <ConversationList conversations={conversations} activeId={activePeer ?? undefined} onSelect={setActivePeer} />
        {conversations.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            No conversations. Add a contact to start.
          </p>
        )}
      </div>

      {adding ? (
        <form
          className="flex flex-col gap-2 border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isUuid(peerId.trim())) {
              setAddError("That's not a valid contact ID");
              return;
            }
            void addContact(peerId.trim(), name.trim() || "Contact")
              .then(() => {
                setAdding(false);
                setPeerId("");
                setName("");
                setAddError(undefined);
              })
              .catch(() => setAddError("Contact not found"));
          }}
        >
          <input
            value={peerId}
            onChange={(e) => setPeerId(e.target.value)}
            placeholder="Contact ID (UUID)"
            className="rounded-md border border-line bg-bg-elevated px-3 py-2 font-mono text-xs text-ink-primary outline-none focus:border-line-active"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name (only you see this)"
            className="rounded-md border border-line bg-bg-elevated px-3 py-2 text-sm text-ink-primary outline-none focus:border-line-active"
          />
          {addError && <span className="text-xs text-burn-red">{addError}</span>}
          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-full bg-lemon py-2 text-sm font-medium text-ink-on-lemon hover:bg-lemon-bright">
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-full px-4 text-sm text-ink-secondary hover:text-ink-primary">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="border-t border-line p-4">
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-full bg-lemon py-2.5 text-sm font-medium text-ink-on-lemon shadow-lemon-sm transition-shadow hover:bg-lemon-bright hover:shadow-lemon-md"
          >
            + New conversation
          </button>
          {accountId && (
            <p className="mt-3 select-text break-all text-center font-mono text-[10px] text-ink-muted">
              Your ID: {accountId}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
