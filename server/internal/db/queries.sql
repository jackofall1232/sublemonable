-- Sublemonable — Copyright (C) 2026 Sublemonable contributors
-- Licensed under the GNU Affero General Public License v3.0 or later.
-- See the LICENSE file in the repository root for full license text.
-- SPDX-License-Identifier: AGPL-3.0-only
--
-- sqlc source of truth — regenerate with `sqlc generate`. The hand-maintained
-- store in store.go mirrors these queries exactly; all of them are
-- parameterized, never string-concatenated.

-- name: CreateAccount :exec
INSERT INTO accounts (id, identity_key) VALUES ($1, $2);

-- name: GetAccountIdentityKey :one
SELECT identity_key FROM accounts WHERE id = $1;

-- name: DeleteAccount :exec
DELETE FROM accounts WHERE id = $1;

-- Envelopes carry no FK to accounts (see schema.sql), so account deletion purges
-- their pending envelopes explicitly, in the same transaction.
-- name: DeleteEnvelopesByRecipient :exec
DELETE FROM envelopes WHERE recipient_id = $1;

-- name: UpsertSignedPrekey :exec
INSERT INTO signed_prekeys (account_id, prekey_id, public_key, signature)
VALUES ($1, $2, $3, $4)
ON CONFLICT (account_id, prekey_id) DO UPDATE
SET public_key = EXCLUDED.public_key, signature = EXCLUDED.signature, created_at = now();

-- name: GetLatestSignedPrekey :one
SELECT prekey_id, public_key, signature FROM signed_prekeys
WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1;

-- name: InsertOneTimePrekey :exec
INSERT INTO one_time_prekeys (account_id, prekey_id, public_key)
VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;

-- name: ConsumeOneTimePrekey :one
DELETE FROM one_time_prekeys
WHERE (account_id, prekey_id) = (
    SELECT account_id, prekey_id FROM one_time_prekeys
    WHERE account_id = $1 ORDER BY prekey_id LIMIT 1 FOR UPDATE SKIP LOCKED
)
RETURNING prekey_id, public_key;

-- name: CountOneTimePrekeys :one
SELECT count(*) FROM one_time_prekeys WHERE account_id = $1;

-- name: StoreEnvelope :exec
INSERT INTO envelopes (id, recipient_id, payload) VALUES ($1, $2, $3);

-- name: PendingEnvelopes :many
SELECT id, payload FROM envelopes WHERE recipient_id = $1 ORDER BY created_at;

-- name: DeleteEnvelope :exec
DELETE FROM envelopes WHERE id = $1 AND recipient_id = $2;

-- name: PurgeExpiredEnvelopes :execrows
DELETE FROM envelopes WHERE created_at < $1;

-- name: RecordDeliveryReceipt :exec
INSERT INTO delivery_receipts (message_id_hash) VALUES ($1) ON CONFLICT DO NOTHING;

-- name: InsertRefreshToken :exec
INSERT INTO refresh_tokens (token_hash, account_id, expires_at) VALUES ($1, $2, $3);

-- name: ConsumeRefreshToken :one
DELETE FROM refresh_tokens WHERE token_hash = $1 AND expires_at > now()
RETURNING account_id;

-- name: DeleteAccountRefreshTokens :exec
DELETE FROM refresh_tokens WHERE account_id = $1;

-- Dead drops (v1.5). No sender column exists, by design.

-- name: DepositDrop :execrows
INSERT INTO drops (drop_id, ciphertext, expires_at)
VALUES ($1, $2, $3) ON CONFLICT (drop_id) DO NOTHING;

-- name: RedeemDrop :one
DELETE FROM drops WHERE drop_id = $1 AND expires_at > now()
RETURNING ciphertext;

-- name: PurgeExpiredDrops :execrows
DELETE FROM drops WHERE expires_at <= $1;
