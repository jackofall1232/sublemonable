-- Sublemonable — Copyright (C) 2026 Sublemonable contributors
-- Licensed under the GNU Affero General Public License v3.0 or later.
-- See the LICENSE file in the repository root for full license text.
-- SPDX-License-Identifier: AGPL-3.0-only
--
-- Zero-knowledge schema: public keys, opaque envelopes, and token hashes.
-- No usernames, no IP addresses, no device identifiers, no plaintext — ever.

CREATE TABLE IF NOT EXISTS accounts (
    id           UUID PRIMARY KEY,
    identity_key BYTEA NOT NULL,            -- Ed25519 public key only
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signed_prekeys (
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    prekey_id  INTEGER NOT NULL,
    public_key BYTEA NOT NULL,
    signature  BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, prekey_id)
);

CREATE TABLE IF NOT EXISTS one_time_prekeys (
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    prekey_id  INTEGER NOT NULL,
    public_key BYTEA NOT NULL,
    PRIMARY KEY (account_id, prekey_id)
);

-- Store-and-forward only: rows are deleted on delivery ack, or purged when
-- undelivered past the TTL. The payload is an opaque encrypted envelope.
--
-- recipient_id has NO foreign key to accounts, deliberately. Validating that the
-- recipient exists would (a) let a sender enumerate which UUIDs are registered by
-- observing send success vs failure, and (b) make decoy traffic — addressed to
-- random UUIDs that resolve to nowhere — distinguishable from real sends. The
-- relay is dumb by design: it stores any envelope and lets the TTL purge what is
-- never collected. Account deletion cleans up pending envelopes explicitly (see
-- DeleteAccount) since there is no cascade.
CREATE TABLE IF NOT EXISTS envelopes (
    id           UUID PRIMARY KEY,
    recipient_id UUID NOT NULL,
    payload      BYTEA NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Drop the v1 foreign key if migrating an existing deployment.
ALTER TABLE envelopes DROP CONSTRAINT IF EXISTS envelopes_recipient_id_fkey;
CREATE INDEX IF NOT EXISTS envelopes_recipient_idx ON envelopes (recipient_id, created_at);
CREATE INDEX IF NOT EXISTS envelopes_created_idx   ON envelopes (created_at);

-- Refresh tokens are stored hashed (SHA-256) and rotated on every use.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash BYTEA PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_account_idx ON refresh_tokens (account_id);

-- Delivery receipts keep only a hash of the message ID — no identity linkage.
CREATE TABLE IF NOT EXISTS delivery_receipts (
    message_id_hash BYTEA PRIMARY KEY,
    delivered_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dead drops (v1.5): anonymous asynchronous deposits. Stored under the hash of a
-- one-time token (drop_id = SHA-256(token)); the relay never sees the token until
-- redemption. There is intentionally NO sender column — the relay cannot know who
-- deposited, and redemption requires no account. A drop is single-use and is
-- destroyed on pickup or when its TTL expires, whichever comes first.
CREATE TABLE IF NOT EXISTS drops (
    drop_id    BYTEA PRIMARY KEY,        -- SHA-256(token); no sender field, by design
    ciphertext BYTEA NOT NULL,           -- opaque, padded encrypted envelope
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drops_expires_idx ON drops (expires_at);
