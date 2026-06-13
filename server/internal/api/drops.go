// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package api

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/sublemonable/server/internal/db"
	"github.com/sublemonable/server/internal/pow"
)

// Dead-drop endpoints (v1.5). Neither deposit nor redeem requires authentication
// — requiring an account would defeat the anonymity that is the entire point.
// Deposit admission is a hashcash proof-of-work bound to the drop ID; redemption
// is gated only by possession of the token.
//
// The drop ID a client supplies is the SHA-256 of its one-time token. The server
// never sees the token on deposit, and on redeem it derives the same ID from the
// presented token, so a deposit and its redemption are linked only by a hash the
// depositor chose — no sender identity exists anywhere.

const dropIDBytes = sha256.Size // 32

type dropDepositRequest struct {
	DropID     string `json:"drop_id"`
	Ciphertext string `json:"ciphertext"`
	PoWNonce   string `json:"pow_nonce"`
}

// DepositDrop accepts an encrypted envelope for anonymous pickup. No auth; a
// valid proof-of-work over the drop ID is required instead.
func (h *Handlers) DepositDrop(c *fiber.Ctx) error {
	if !h.dropLimit.Allow(c.IP()) {
		return errJSON(c, fiber.StatusTooManyRequests, "rate_limited")
	}
	var req dropDepositRequest
	if err := c.BodyParser(&req); err != nil {
		return errJSON(c, fiber.StatusBadRequest, "bad_request")
	}
	dropID, err := base64.StdEncoding.DecodeString(req.DropID)
	if err != nil || len(dropID) != dropIDBytes {
		return errJSON(c, fiber.StatusBadRequest, "bad_drop_id")
	}
	nonce, err := base64.StdEncoding.DecodeString(req.PoWNonce)
	if err != nil || len(nonce) != pow.NonceBytes {
		return errJSON(c, fiber.StatusBadRequest, "bad_pow")
	}
	ciphertext, err := base64.StdEncoding.DecodeString(req.Ciphertext)
	if err != nil || len(ciphertext) == 0 {
		return errJSON(c, fiber.StatusBadRequest, "bad_ciphertext")
	}
	// The proof-of-work must be bound to THIS drop ID — no precomputation.
	if !pow.Verify(dropID, nonce, h.cfg.DropPoWDifficulty) {
		return errJSON(c, fiber.StatusBadRequest, "bad_pow")
	}

	expiresAt := time.Now().Add(time.Duration(h.cfg.DropTTLHours) * time.Hour)
	if err := h.store.DepositDrop(c.Context(), dropID, ciphertext, expiresAt); err != nil {
		if errors.Is(err, db.ErrDropExists) {
			return errJSON(c, fiber.StatusConflict, "drop_exists")
		}
		return errJSON(c, fiber.StatusInternalServerError, "store_failed")
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"expires_at": expiresAt.UTC().Format(time.RFC3339),
	})
}

type dropRedeemRequest struct {
	Token string `json:"token"`
}

// RedeemDrop returns an envelope and destroys the drop. Single-use: a second
// attempt with the same token returns 404. No account required.
func (h *Handlers) RedeemDrop(c *fiber.Ctx) error {
	if !h.dropLimit.Allow(c.IP()) {
		return errJSON(c, fiber.StatusTooManyRequests, "rate_limited")
	}
	var req dropRedeemRequest
	if err := c.BodyParser(&req); err != nil {
		return errJSON(c, fiber.StatusBadRequest, "bad_request")
	}
	token, err := base64.StdEncoding.DecodeString(req.Token)
	if err != nil || len(token) == 0 {
		return errJSON(c, fiber.StatusBadRequest, "bad_token")
	}
	// The relay derives the drop ID from the token preimage — knowing the ID
	// alone (which is public) is not enough to redeem.
	dropID := sha256.Sum256(token)
	ciphertext, err := h.store.RedeemDrop(c.Context(), dropID[:])
	if err != nil {
		// No row, already redeemed, or expired — all indistinguishable.
		return errJSON(c, fiber.StatusNotFound, "not_found")
	}
	return c.JSON(fiber.Map{
		"ciphertext": base64.StdEncoding.EncodeToString(ciphertext),
	})
}
