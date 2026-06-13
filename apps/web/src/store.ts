// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Application state + messaging service. Decrypted messages live in memory
// only — nothing content-bearing is ever persisted. The keystore persists as
// a single AES-256-GCM blob in IndexedDB.

import {
  decryptKeyStore,
  deriveKeyFromPassword,
  encryptKeyStore,
  fromBase64,
  generateDropToken,
  generateIdentityKeyPair,
  generateOneTimePrekeys,
  generateSalt,
  generateSignedPrekey,
  pad,
  ratchetDecrypt,
  ratchetEncrypt,
  safetyNumber,
  signWithIdentity,
  solveProofOfWork,
  toBase64,
  unpad,
  utf8Decode,
  utf8Encode,
  x3dhInitiate,
  x3dhRespond,
  type KeyStore,
} from "@sublemonable/crypto";
import {
  DROP_POW_DIFFICULTY,
  ONE_TIME_PREKEY_BATCH,
  parseEnvelope,
  PROTOCOL_VERSION,
  type MessageEnvelope,
  type ServerEvent,
} from "@sublemonable/protocol";
import { DecoyScheduler } from "@sublemonable/relay-client";
import { create } from "zustand";
import { useSettings } from "./settings.js";
import { api } from "./lib/api.js";
import { b64, unb64 } from "./lib/bytes.js";
import {
  deserializeIdentity,
  deserializeOneTimePrekey,
  deserializeSession,
  deserializeSignedPrekey,
  serializeIdentity,
  serializeOneTimePrekey,
  serializeSession,
  serializeSignedPrekey,
  type SerializedIdentity,
  type SerializedOneTimePrekey,
  type SerializedSession,
  type SerializedSignedPrekey,
} from "./lib/serialization.js";
import { destroyVault, loadVault, saveVault } from "./lib/storage.js";
import { WsClient, type WsStatus } from "./lib/ws.js";

export interface ContactRecord {
  displayName: string;
  identityKey: string; // peer's Ed25519 public key, base64
  session: SerializedSession;
  // X3DH header data repeated on every message until the peer first replies
  pendingEphemeralKey: string | null;
  pendingPrekeyId: number | null;
}

export interface Message {
  id: string;
  peerId: string;
  direction: "sent" | "received";
  text: string;
  timestamp: string;
  ttlSeconds: number | null;
  burnOnRead: boolean;
  deliveredAt: number;
  burning: boolean;
  opened: boolean;
}

type Phase = "loading" | "setup" | "unlock" | "ready";

interface AppState {
  phase: Phase;
  unlockError?: string;
  accountId: string | null;
  keyStore: KeyStore | null;
  masterKey: Uint8Array | null;
  salt: Uint8Array | null;
  accessToken: string | null;
  refreshToken: string | null;
  ws: WsClient | null;
  wsStatus: WsStatus;
  contacts: Record<string, ContactRecord>;
  messages: Record<string, Message[]>;
  activePeer: string | null;

  bootstrap: () => Promise<void>;
  createAccount: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  addContact: (peerAccountId: string, displayName: string) => Promise<void>;
  sendMessage: (
    peerId: string,
    text: string,
    opts: { ttlSeconds: number | null; burnOnRead: boolean },
  ) => Promise<void>;
  openMessage: (peerId: string, messageId: string) => void;
  finishBurn: (peerId: string, messageId: string) => void;
  /** Encrypt a message to a contact and deposit it as a dead drop; returns the
   *  base64 one-time token to share out of band (QR / separate channel). */
  sendDeadDrop: (peerId: string, text: string) => Promise<string>;
  /** Redeem a dead drop by token: fetch, decrypt, and surface the message. */
  redeemDeadDrop: (tokenB64: string) => Promise<void>;
  expireMessage: (peerId: string, messageId: string) => void;
  setActivePeer: (peerId: string | null) => void;
  markVerified: (peerId: string) => Promise<void>;
  getSafetyNumber: (peerId: string) => Promise<string>;
  deleteAccount: () => Promise<void>;
  lock: () => void;
}

export const useApp = create<AppState>((set, get) => {
  // ── internals ──────────────────────────────────────────────────────────────

  const persist = async (): Promise<void> => {
    const { keyStore, masterKey, salt, contacts } = get();
    if (!keyStore || !masterKey || !salt) return;
    keyStore.sessions = contacts as unknown as Record<string, unknown>;
    await saveVault(salt, await encryptKeyStore(masterKey, keyStore));
  };

  const login = async (): Promise<void> => {
    const { keyStore } = get();
    if (!keyStore) throw new Error("locked");
    const identity = deserializeIdentity(keyStore.identityKey as unknown as SerializedIdentity);
    const timestamp = Math.floor(Date.now() / 1000);
    const challenge = utf8Encode(`sublemonable-login:${keyStore.accountId}:${timestamp}`);
    const signature = b64(await signWithIdentity(challenge, identity));
    const tokens = await api.createSession(keyStore.accountId, timestamp, signature);
    set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
  };

  const freshToken = async (): Promise<string> => {
    const { refreshToken } = get();
    if (refreshToken) {
      try {
        const tokens = await api.refreshSession(refreshToken);
        set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
        return tokens.access_token;
      } catch {
        // Rotation chain broken (expired/revoked) — fall through to re-login.
      }
    }
    await login();
    return get().accessToken!;
  };

  // Cover-traffic generator. Submits decoy envelopes over the same WebSocket path
  // as real messages so that, on the wire, sending and idle are indistinguishable.
  let decoy: DecoyScheduler | null = null;
  let unsubSettings: (() => void) | null = null;

  const startDecoy = (ws: WsClient, senderId: string): void => {
    const intensity = useSettings.getState().coverTraffic;
    decoy = new DecoyScheduler({
      senderId,
      submit: (envelope) => ws.send({ type: "message.send", envelope }),
      intensity,
    });
    decoy.start();
    // React to live cover-traffic changes from Settings.
    unsubSettings = useSettings.subscribe((s) => decoy?.setIntensity(s.coverTraffic));
  };

  const stopDecoy = (): void => {
    decoy?.stop();
    decoy = null;
    unsubSettings?.();
    unsubSettings = null;
  };

  const connect = (): void => {
    const ws = new WsClient(freshToken, handleServerEvent, (wsStatus) => set({ wsStatus }));
    set({ ws });
    void ws.connect();
    const accountId = get().accountId;
    if (accountId) startDecoy(ws, accountId);
  };

  const appendMessage = (peerId: string, message: Message): void => {
    set((s) => ({
      messages: { ...s.messages, [peerId]: [...(s.messages[peerId] ?? []), message] },
    }));
  };

  const removeMessage = (peerId: string, messageId: string): void => {
    set((s) => ({
      messages: {
        ...s.messages,
        [peerId]: (s.messages[peerId] ?? []).filter((m) => m.id !== messageId),
      },
    }));
  };

  const setBurning = (peerId: string, messageId: string): void => {
    set((s) => ({
      messages: {
        ...s.messages,
        [peerId]: (s.messages[peerId] ?? []).map((m) =>
          m.id === messageId ? { ...m, burning: true } : m,
        ),
      },
    }));
  };

  // Establish a responder session from an X3DH initial message.
  const respondToInitialMessage = async (envelope: MessageEnvelope): Promise<ContactRecord> => {
    const { keyStore } = get();
    if (!keyStore || !envelope.ephemeral_key) throw new Error("bad initial message");
    const identity = deserializeIdentity(keyStore.identityKey as unknown as SerializedIdentity);

    // The envelope doesn't carry the sender's identity key — fetch it.
    const token = await freshToken();
    const senderBundle = await api.fetchPrekeyBundle(envelope.sender_id, token);
    const senderIdentityKey = unb64(senderBundle.identity_key);

    const otps = keyStore.oneTimePrekeys as unknown as SerializedOneTimePrekey[];
    const usedOtp =
      envelope.prekey_id == null ? null : (otps.find((p) => p.id === envelope.prekey_id) ?? null);

    // Try our signed prekeys, newest first — the initiator used whichever was
    // current when they fetched our bundle.
    const spks = [...(keyStore.signedPrekeys as unknown as SerializedSignedPrekey[])].sort(
      (a, c) => c.createdAt - a.createdAt,
    );
    let lastError: unknown = new Error("no signed prekeys");
    for (const spk of spks) {
      try {
        const session = await x3dhRespond(
          identity,
          deserializeSignedPrekey(spk),
          usedOtp ? deserializeOneTimePrekey(usedOtp) : null,
          senderIdentityKey,
          unb64(envelope.ephemeral_key),
        );
        const plaintextProbe = await ratchetDecrypt(session, {
          blob: unb64(envelope.ciphertext),
          messageNumber: envelope.message_number,
          previousChainLength: envelope.previous_chain_length,
        });
        // Success — consume the one-time prekey (single-use by design).
        if (usedOtp) {
          keyStore.oneTimePrekeys = otps.filter(
            (p) => p.id !== usedOtp.id,
          ) as unknown as KeyStore["oneTimePrekeys"];
        }
        const contact: ContactRecord = {
          displayName: `Contact ${envelope.sender_id.slice(0, 8)}`,
          identityKey: senderBundle.identity_key,
          session: serializeSession(session),
          pendingEphemeralKey: null,
          pendingPrekeyId: null,
        };
        set((s) => ({ contacts: { ...s.contacts, [envelope.sender_id]: contact } }));
        appendMessage(envelope.sender_id, {
          id: envelope.id,
          peerId: envelope.sender_id,
          direction: "received",
          text: utf8Decode(plaintextProbe),
          timestamp: envelope.timestamp,
          ttlSeconds: envelope.ttl_seconds,
          burnOnRead: envelope.burn_on_read,
          deliveredAt: Date.now(),
          burning: false,
          opened: false,
        });
        return contact;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  };

  const handleServerEvent = (event: ServerEvent): void => {
    void (async () => {
      switch (event.type) {
        case "message.deliver": {
          const envelope = parseEnvelope(event.envelope);
          const { contacts, ws } = get();
          const contact = contacts[envelope.sender_id];
          try {
            if (!contact) {
              await respondToInitialMessage(envelope);
            } else {
              const session = deserializeSession(contact.session);
              const plaintext = await ratchetDecrypt(session, {
                blob: unb64(envelope.ciphertext),
                messageNumber: envelope.message_number,
                previousChainLength: envelope.previous_chain_length,
              });
              contact.session = serializeSession(session);
              // First message from them: our X3DH header is no longer needed.
              contact.pendingEphemeralKey = null;
              contact.pendingPrekeyId = null;
              set((s) => ({ contacts: { ...s.contacts, [envelope.sender_id]: { ...contact } } }));
              appendMessage(envelope.sender_id, {
                id: envelope.id,
                peerId: envelope.sender_id,
                direction: "received",
                text: utf8Decode(plaintext),
                timestamp: envelope.timestamp,
                ttlSeconds: envelope.ttl_seconds,
                burnOnRead: envelope.burn_on_read,
                deliveredAt: Date.now(),
                burning: false,
                opened: false,
              });
            }
            // Ack triggers immediate server-side deletion of the envelope.
            ws?.send({ type: "message.ack", message_id: envelope.id });
            await persist();
          } catch {
            // Undecryptable envelope: never ack what we couldn't deliver to
            // the user, and never log payloads.
          }
          break;
        }
        case "message.burned": {
          // Peer destroyed a message — destroy our copy with the burn animation.
          setBurning(event.peer_id, event.message_id);
          break;
        }
        case "prekey.low": {
          const { keyStore } = get();
          if (!keyStore) break;
          const existing = keyStore.oneTimePrekeys as unknown as SerializedOneTimePrekey[];
          const nextId = existing.reduce((max, p) => Math.max(max, p.id), 0) + 1;
          const fresh = await generateOneTimePrekeys(
            ONE_TIME_PREKEY_BATCH - event.remaining,
            nextId,
          );
          keyStore.oneTimePrekeys = [
            ...existing,
            ...fresh.map(serializeOneTimePrekey),
          ] as unknown as KeyStore["oneTimePrekeys"];
          const token = await freshToken();
          await api.uploadPrekeys(
            { one_time_prekeys: fresh.map((p) => ({ id: p.id, public_key: b64(p.publicKey) })) },
            token,
          );
          await persist();
          break;
        }
        case "session.revoked": {
          get().ws?.close();
          set({ wsStatus: "closed" });
          break;
        }
        default:
          break;
      }
    })();
  };

  // ── public actions ─────────────────────────────────────────────────────────

  return {
    phase: "loading",
    accountId: null,
    keyStore: null,
    masterKey: null,
    salt: null,
    accessToken: null,
    refreshToken: null,
    ws: null,
    wsStatus: "closed",
    contacts: {},
    messages: {},
    activePeer: null,

    async bootstrap() {
      const vault = await loadVault();
      set({ phase: vault ? "unlock" : "setup" });
    },

    async createAccount(passphrase) {
      const identity = await generateIdentityKeyPair();
      const signedPrekey = await generateSignedPrekey(identity, 1);
      const oneTimePrekeys = await generateOneTimePrekeys(ONE_TIME_PREKEY_BATCH);

      const { account_id } = await api.register({
        identity_key: b64(identity.publicKey),
        signed_prekey: {
          id: signedPrekey.id,
          public_key: b64(signedPrekey.publicKey),
          signature: b64(signedPrekey.signature),
        },
        one_time_prekeys: oneTimePrekeys.map((p) => ({ id: p.id, public_key: b64(p.publicKey) })),
      });

      const salt = await generateSalt();
      const masterKey = await deriveKeyFromPassword(passphrase, salt);
      const keyStore: KeyStore = {
        version: 1,
        accountId: account_id,
        identityKey: serializeIdentity(identity) as unknown as KeyStore["identityKey"],
        signedPrekeys: [
          serializeSignedPrekey(signedPrekey),
        ] as unknown as KeyStore["signedPrekeys"],
        oneTimePrekeys: oneTimePrekeys.map(
          serializeOneTimePrekey,
        ) as unknown as KeyStore["oneTimePrekeys"],
        sessions: {},
        verifiedContacts: {},
      };
      set({ keyStore, masterKey, salt, accountId: account_id, contacts: {} });
      await persist();
      await login();
      connect();
      set({ phase: "ready" });
    },

    async unlock(passphrase) {
      const vault = await loadVault();
      if (!vault) {
        set({ phase: "setup" });
        return;
      }
      try {
        const masterKey = await deriveKeyFromPassword(passphrase, vault.salt);
        const keyStore = await decryptKeyStore(masterKey, vault.blob);
        set({
          keyStore,
          masterKey,
          salt: vault.salt,
          accountId: keyStore.accountId,
          contacts: keyStore.sessions as unknown as Record<string, ContactRecord>,
          unlockError: undefined,
        });
        await login();
        connect();
        set({ phase: "ready" });
      } catch {
        set({ unlockError: "Wrong passphrase" });
      }
    },

    async addContact(peerAccountId, displayName) {
      const { keyStore, contacts } = get();
      if (!keyStore || contacts[peerAccountId]) return;
      const identity = deserializeIdentity(keyStore.identityKey as unknown as SerializedIdentity);
      const token = await freshToken();
      const bundle = await api.fetchPrekeyBundle(peerAccountId, token);
      const result = await x3dhInitiate(identity, {
        identityKey: unb64(bundle.identity_key),
        signedPrekey: {
          id: bundle.signed_prekey.id,
          publicKey: unb64(bundle.signed_prekey.public_key),
          signature: unb64(bundle.signed_prekey.signature),
        },
        oneTimePrekey: bundle.one_time_prekey
          ? { id: bundle.one_time_prekey.id, publicKey: unb64(bundle.one_time_prekey.public_key) }
          : null,
      });
      const contact: ContactRecord = {
        displayName,
        identityKey: bundle.identity_key,
        session: serializeSession(result.session),
        pendingEphemeralKey: b64(result.ephemeralPublicKey),
        pendingPrekeyId: result.usedPrekeyId,
      };
      set((s) => ({ contacts: { ...s.contacts, [peerAccountId]: contact } }));
      await persist();
    },

    async sendMessage(peerId, text, opts) {
      const { contacts, accountId, ws } = get();
      const contact = contacts[peerId];
      if (!contact || !accountId || !ws) return;

      const session = deserializeSession(contact.session);
      const encrypted = await ratchetEncrypt(session, utf8Encode(text));
      contact.session = serializeSession(session);
      set((s) => ({ contacts: { ...s.contacts, [peerId]: { ...contact } } }));

      const envelope: MessageEnvelope = {
        id: crypto.randomUUID(),
        sender_id: accountId,
        recipient_id: peerId,
        ciphertext: b64(encrypted.blob),
        ephemeral_key: contact.pendingEphemeralKey,
        prekey_id: contact.pendingPrekeyId,
        message_number: encrypted.messageNumber,
        previous_chain_length: encrypted.previousChainLength,
        timestamp: new Date().toISOString(),
        ttl_seconds: opts.ttlSeconds,
        burn_on_read: opts.burnOnRead,
        media_type: "text",
        version: PROTOCOL_VERSION,
      };
      ws.send({ type: "message.send", envelope });
      appendMessage(peerId, {
        id: envelope.id,
        peerId,
        direction: "sent",
        text,
        timestamp: envelope.timestamp,
        ttlSeconds: opts.ttlSeconds,
        burnOnRead: opts.burnOnRead,
        deliveredAt: Date.now(),
        burning: false,
        opened: true,
      });
      await persist();
    },

    async sendDeadDrop(peerId, text) {
      const { contacts, accountId } = get();
      const contact = contacts[peerId];
      if (!contact || !accountId) throw new Error("unknown contact");

      // Encrypt exactly as a normal message — the dead drop carries a full
      // envelope so the recipient decrypts it with the established session.
      const session = deserializeSession(contact.session);
      const encrypted = await ratchetEncrypt(session, utf8Encode(text));
      contact.session = serializeSession(session);
      set((s) => ({ contacts: { ...s.contacts, [peerId]: { ...contact } } }));

      const envelope: MessageEnvelope = {
        id: crypto.randomUUID(),
        sender_id: accountId,
        recipient_id: peerId,
        ciphertext: b64(encrypted.blob),
        ephemeral_key: contact.pendingEphemeralKey,
        prekey_id: contact.pendingPrekeyId,
        message_number: encrypted.messageNumber,
        previous_chain_length: encrypted.previousChainLength,
        timestamp: new Date().toISOString(),
        ttl_seconds: null,
        burn_on_read: false,
        media_type: "text",
        version: PROTOCOL_VERSION,
      };

      // Pad the serialized envelope to a 256-byte block so the deposit size
      // reveals nothing, then deposit under a one-time token with proof-of-work.
      const padded = await pad(utf8Encode(JSON.stringify(envelope)));
      const { token, dropId } = await generateDropToken();
      const powNonce = await solveProofOfWork(dropId, DROP_POW_DIFFICULTY);
      await api.depositDrop({
        drop_id: await toBase64(dropId),
        ciphertext: await toBase64(padded),
        pow_nonce: await toBase64(powNonce),
      });

      appendMessage(peerId, {
        id: envelope.id,
        peerId,
        direction: "sent",
        text,
        timestamp: envelope.timestamp,
        ttlSeconds: null,
        burnOnRead: false,
        deliveredAt: Date.now(),
        burning: false,
        opened: true,
      });
      await persist();
      // The token is the capability — shared out of band, never with the server.
      return await toBase64(token);
    },

    async redeemDeadDrop(tokenB64) {
      const { ciphertext } = await api.redeemDrop(tokenB64.trim());
      const padded = await fromBase64(ciphertext);
      const envelope = parseEnvelope(JSON.parse(utf8Decode(unpad(padded))));
      // Reuse the normal inbound path to establish/advance the session and
      // surface the message.
      handleServerEvent({ type: "message.deliver", envelope });
    },

    openMessage(peerId, messageId) {
      const message = (get().messages[peerId] ?? []).find((m) => m.id === messageId);
      if (!message || message.opened) return;
      set((s) => ({
        messages: {
          ...s.messages,
          [peerId]: (s.messages[peerId] ?? []).map((m) =>
            m.id === messageId ? { ...m, opened: true } : m,
          ),
        },
      }));
      if (message.burnOnRead && message.direction === "received") {
        // Destroyed everywhere after first open: burn locally, tell the peer.
        setBurning(peerId, messageId);
        get().ws?.send({ type: "message.burn", message_id: messageId, peer_id: peerId });
      }
    },

    finishBurn(peerId, messageId) {
      removeMessage(peerId, messageId);
    },

    expireMessage(peerId, messageId) {
      setBurning(peerId, messageId);
    },

    setActivePeer(peerId) {
      set({ activePeer: peerId });
    },

    async markVerified(peerId) {
      const { keyStore, contacts } = get();
      const contact = contacts[peerId];
      if (!keyStore || !contact) return;
      keyStore.verifiedContacts[peerId] = contact.identityKey;
      await persist();
      set((s) => ({ contacts: { ...s.contacts } }));
    },

    async getSafetyNumber(peerId) {
      const { keyStore, contacts } = get();
      const contact = contacts[peerId];
      if (!keyStore || !contact) return "";
      const mine = (keyStore.identityKey as unknown as SerializedIdentity).publicKey;
      return safetyNumber(unb64(mine), unb64(contact.identityKey));
    },

    async deleteAccount() {
      const token = await freshToken();
      await api.deleteAccount(token);
      stopDecoy();
      get().ws?.close();
      await destroyVault();
      set({
        phase: "setup",
        keyStore: null,
        masterKey: null,
        salt: null,
        accountId: null,
        accessToken: null,
        refreshToken: null,
        contacts: {},
        messages: {},
        activePeer: null,
      });
    },

    lock() {
      stopDecoy();
      get().ws?.close();
      // Drop key material and decrypted messages from memory.
      set({
        phase: "unlock",
        keyStore: null,
        masterKey: null,
        accessToken: null,
        refreshToken: null,
        messages: {},
        contacts: {},
        activePeer: null,
      });
    },
  };
});
