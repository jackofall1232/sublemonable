// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Package db is the type-safe storage layer. Every query is parameterized —
// no string concatenation, no ORM magic. queries.sql is the sqlc source of
// truth; this file mirrors it.
package db

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrDropExists is returned when a deposit collides with an existing drop ID.
var ErrDropExists = errors.New("drop already exists")

//go:embed schema.sql
var schemaSQL string

type Store struct {
	pool *pgxpool.Pool
}

func Open(ctx context.Context, databaseURL string) (*Store, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if _, err := pool.Exec(ctx, schemaSQL); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

// ── accounts ─────────────────────────────────────────────────────────────────

func (s *Store) CreateAccount(ctx context.Context, id uuid.UUID, identityKey []byte) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO accounts (id, identity_key) VALUES ($1, $2)`, id, identityKey)
	return err
}

func (s *Store) GetAccountIdentityKey(ctx context.Context, id uuid.UUID) ([]byte, error) {
	var key []byte
	err := s.pool.QueryRow(ctx, `SELECT identity_key FROM accounts WHERE id = $1`, id).Scan(&key)
	return key, err
}

// DeleteAccount is a full purge: prekeys, pending envelopes, refresh tokens,
// and the account record all cascade. Irreversible by design.
func (s *Store) DeleteAccount(ctx context.Context, id uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM accounts WHERE id = $1`, id)
	return err
}

// ── prekeys ──────────────────────────────────────────────────────────────────

func (s *Store) UpsertSignedPrekey(ctx context.Context, accountID uuid.UUID, prekeyID int32, publicKey, signature []byte) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO signed_prekeys (account_id, prekey_id, public_key, signature)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (account_id, prekey_id) DO UPDATE
		SET public_key = EXCLUDED.public_key, signature = EXCLUDED.signature, created_at = now()`,
		accountID, prekeyID, publicKey, signature)
	return err
}

type SignedPrekey struct {
	ID        int32
	PublicKey []byte
	Signature []byte
}

func (s *Store) GetLatestSignedPrekey(ctx context.Context, accountID uuid.UUID) (SignedPrekey, error) {
	var p SignedPrekey
	err := s.pool.QueryRow(ctx, `
		SELECT prekey_id, public_key, signature FROM signed_prekeys
		WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1`, accountID).
		Scan(&p.ID, &p.PublicKey, &p.Signature)
	return p, err
}

func (s *Store) InsertOneTimePrekeys(ctx context.Context, accountID uuid.UUID, prekeys map[int32][]byte, maxPerUser int) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM one_time_prekeys WHERE account_id = $1`, accountID).Scan(&count); err != nil {
		return err
	}
	for id, pub := range prekeys {
		if count >= maxPerUser {
			break
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO one_time_prekeys (account_id, prekey_id, public_key)
			VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, accountID, id, pub); err != nil {
			return err
		}
		count++
	}
	return tx.Commit(ctx)
}

type OneTimePrekey struct {
	ID        int32
	PublicKey []byte
}

// ConsumeOneTimePrekey atomically pops one prekey — one-time prekeys are
// single-use by design, so the row is deleted in the same statement that
// returns it. Returns pgx.ErrNoRows when the stock is empty.
func (s *Store) ConsumeOneTimePrekey(ctx context.Context, accountID uuid.UUID) (OneTimePrekey, error) {
	var p OneTimePrekey
	err := s.pool.QueryRow(ctx, `
		DELETE FROM one_time_prekeys
		WHERE (account_id, prekey_id) = (
			SELECT account_id, prekey_id FROM one_time_prekeys
			WHERE account_id = $1 ORDER BY prekey_id LIMIT 1 FOR UPDATE SKIP LOCKED
		)
		RETURNING prekey_id, public_key`, accountID).
		Scan(&p.ID, &p.PublicKey)
	return p, err
}

func (s *Store) CountOneTimePrekeys(ctx context.Context, accountID uuid.UUID) (int, error) {
	var count int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM one_time_prekeys WHERE account_id = $1`, accountID).Scan(&count)
	return count, err
}

// ── envelopes (store-and-forward only) ───────────────────────────────────────

func (s *Store) StoreEnvelope(ctx context.Context, id, recipientID uuid.UUID, payload []byte) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO envelopes (id, recipient_id, payload) VALUES ($1, $2, $3)`,
		id, recipientID, payload)
	return err
}

type PendingEnvelope struct {
	ID      uuid.UUID
	Payload []byte
}

func (s *Store) PendingEnvelopes(ctx context.Context, recipientID uuid.UUID) ([]PendingEnvelope, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, payload FROM envelopes WHERE recipient_id = $1 ORDER BY created_at`, recipientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PendingEnvelope
	for rows.Next() {
		var e PendingEnvelope
		if err := rows.Scan(&e.ID, &e.Payload); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// DeleteEnvelope removes a message the moment delivery is acknowledged.
func (s *Store) DeleteEnvelope(ctx context.Context, id, recipientID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM envelopes WHERE id = $1 AND recipient_id = $2`, id, recipientID)
	return err
}

// PurgeExpiredEnvelopes deletes undelivered envelopes older than the cutoff and
// returns their IDs grouped by recipient is intentionally NOT returned —
// senders are notified via the janitor without identity linkage.
func (s *Store) PurgeExpiredEnvelopes(ctx context.Context, cutoff time.Time) (int64, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM envelopes WHERE created_at < $1`, cutoff)
	return tag.RowsAffected(), err
}

// RecordDeliveryReceipt stores only a hash of the message ID — no identities.
func (s *Store) RecordDeliveryReceipt(ctx context.Context, messageIDHash []byte) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO delivery_receipts (message_id_hash) VALUES ($1) ON CONFLICT DO NOTHING`, messageIDHash)
	return err
}

// ── dead drops (v1.5, anonymous store-and-forward) ───────────────────────────

// DepositDrop stores an encrypted envelope under a drop ID (hash of a one-time
// token). No sender is recorded — the table has no column for it. A duplicate
// drop ID is rejected so a token cannot be silently overwritten.
func (s *Store) DepositDrop(ctx context.Context, dropID, ciphertext []byte, expiresAt time.Time) error {
	tag, err := s.pool.Exec(ctx, `
		INSERT INTO drops (drop_id, ciphertext, expires_at)
		VALUES ($1, $2, $3) ON CONFLICT (drop_id) DO NOTHING`,
		dropID, ciphertext, expiresAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrDropExists
	}
	return nil
}

// RedeemDrop returns and destroys a drop in a single statement — single-use by
// design. A second redemption of the same token hits no row and returns
// pgx.ErrNoRows, which the handler maps to 404. Expired drops are not returned.
func (s *Store) RedeemDrop(ctx context.Context, dropID []byte) ([]byte, error) {
	var ciphertext []byte
	err := s.pool.QueryRow(ctx, `
		DELETE FROM drops WHERE drop_id = $1 AND expires_at > now()
		RETURNING ciphertext`, dropID).Scan(&ciphertext)
	return ciphertext, err
}

// PurgeExpiredDrops deletes drops past their TTL whether collected or not.
func (s *Store) PurgeExpiredDrops(ctx context.Context, now time.Time) (int64, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM drops WHERE expires_at <= $1`, now)
	return tag.RowsAffected(), err
}

// ── refresh tokens ───────────────────────────────────────────────────────────

func (s *Store) InsertRefreshToken(ctx context.Context, tokenHash []byte, accountID uuid.UUID, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO refresh_tokens (token_hash, account_id, expires_at) VALUES ($1, $2, $3)`,
		tokenHash, accountID, expiresAt)
	return err
}

// ConsumeRefreshToken deletes the token in the same statement that validates
// it — rotation on every use, atomically.
func (s *Store) ConsumeRefreshToken(ctx context.Context, tokenHash []byte) (uuid.UUID, error) {
	var accountID uuid.UUID
	err := s.pool.QueryRow(ctx, `
		DELETE FROM refresh_tokens WHERE token_hash = $1 AND expires_at > now()
		RETURNING account_id`, tokenHash).Scan(&accountID)
	return accountID, err
}

func (s *Store) DeleteAccountRefreshTokens(ctx context.Context, accountID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM refresh_tokens WHERE account_id = $1`, accountID)
	return err
}

var ErrNoRows = pgx.ErrNoRows
