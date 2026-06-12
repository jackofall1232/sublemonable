// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Package api hosts the REST endpoints: registration, sessions, prekeys, and
// account deletion. Requests are never body-logged; errors carry codes only.
package api

import (
	"crypto/ed25519"
	"encoding/base64"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/sublemonable/server/internal/auth"
	"github.com/sublemonable/server/internal/config"
	"github.com/sublemonable/server/internal/db"
	"github.com/sublemonable/server/internal/ratelimit"
)

type Handlers struct {
	store         *db.Store
	issuer        *auth.Issuer
	cfg           *config.Config
	registerLimit *ratelimit.Limiter
	prekeyLimit   *ratelimit.Limiter
}

func New(store *db.Store, issuer *auth.Issuer, cfg *config.Config) *Handlers {
	return &Handlers{
		store:         store,
		issuer:        issuer,
		cfg:           cfg,
		registerLimit: ratelimit.New(5, time.Hour, cfg.RateLimitEnabled),
		prekeyLimit:   ratelimit.New(50, time.Minute, cfg.RateLimitEnabled),
	}
}

func errJSON(c *fiber.Ctx, status int, code string) error {
	return c.Status(status).JSON(fiber.Map{"error": code})
}

// ── registration ─────────────────────────────────────────────────────────────

type prekeyJSON struct {
	ID        int32  `json:"id"`
	PublicKey string `json:"public_key"`
	Signature string `json:"signature,omitempty"`
}

type registerRequest struct {
	IdentityKey    string       `json:"identity_key"`
	SignedPrekey   prekeyJSON   `json:"signed_prekey"`
	OneTimePrekeys []prekeyJSON `json:"one_time_prekeys"`
}

// Register accepts PUBLIC key material only — there is nothing secret in this
// request by construction. The client address is used transiently for rate
// limiting and never stored or logged.
func (h *Handlers) Register(c *fiber.Ctx) error {
	if !h.registerLimit.Allow(c.IP()) {
		return errJSON(c, fiber.StatusTooManyRequests, "rate_limited")
	}
	var req registerRequest
	if err := c.BodyParser(&req); err != nil {
		return errJSON(c, fiber.StatusBadRequest, "bad_request")
	}
	identityKey, err := base64.StdEncoding.DecodeString(req.IdentityKey)
	if err != nil || len(identityKey) != ed25519.PublicKeySize {
		return errJSON(c, fiber.StatusBadRequest, "bad_identity_key")
	}
	spkPub, err1 := base64.StdEncoding.DecodeString(req.SignedPrekey.PublicKey)
	spkSig, err2 := base64.StdEncoding.DecodeString(req.SignedPrekey.Signature)
	if err1 != nil || err2 != nil || len(spkPub) != 32 {
		return errJSON(c, fiber.StatusBadRequest, "bad_signed_prekey")
	}
	// The server verifies the prekey signature too — a malformed bundle should
	// never be servable to other clients.
	if !ed25519.Verify(identityKey, spkPub, spkSig) {
		return errJSON(c, fiber.StatusBadRequest, "bad_prekey_signature")
	}

	accountID := uuid.New()
	ctx := c.Context()
	if err := h.store.CreateAccount(ctx, accountID, identityKey); err != nil {
		return errJSON(c, fiber.StatusInternalServerError, "store_failed")
	}
	if err := h.store.UpsertSignedPrekey(ctx, accountID, req.SignedPrekey.ID, spkPub, spkSig); err != nil {
		return errJSON(c, fiber.StatusInternalServerError, "store_failed")
	}
	otps := make(map[int32][]byte, len(req.OneTimePrekeys))
	for _, p := range req.OneTimePrekeys {
		pub, err := base64.StdEncoding.DecodeString(p.PublicKey)
		if err != nil || len(pub) != 32 {
			return errJSON(c, fiber.StatusBadRequest, "bad_one_time_prekey")
		}
		otps[p.ID] = pub
	}
	if err := h.store.InsertOneTimePrekeys(ctx, accountID, otps, h.cfg.MaxPrekeysPerUser); err != nil {
		return errJSON(c, fiber.StatusInternalServerError, "store_failed")
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"account_id": accountID})
}

// ── sessions ─────────────────────────────────────────────────────────────────

type sessionRequest struct {
	AccountID string `json:"account_id"`
	Timestamp int64  `json:"timestamp"`
	Signature string `json:"signature"`
}

// CreateSession authenticates by Ed25519 signature over a timestamped
// challenge — possession of the identity key IS the account.
func (h *Handlers) CreateSession(c *fiber.Ctx) error {
	var req sessionRequest
	if err := c.BodyParser(&req); err != nil {
		return errJSON(c, fiber.StatusBadRequest, "bad_request")
	}
	accountID, err := uuid.Parse(req.AccountID)
	if err != nil {
		return errJSON(c, fiber.StatusBadRequest, "bad_account")
	}
	signature, err := base64.StdEncoding.DecodeString(req.Signature)
	if err != nil {
		return errJSON(c, fiber.StatusBadRequest, "bad_signature")
	}
	identityKey, err := h.store.GetAccountIdentityKey(c.Context(), accountID)
	if err != nil {
		// Same response as a bad signature — no account enumeration.
		return errJSON(c, fiber.StatusUnauthorized, "unauthorized")
	}
	now := time.Now()
	if err := auth.VerifyLogin(identityKey, accountID, time.Unix(req.Timestamp, 0), signature, now); err != nil {
		return errJSON(c, fiber.StatusUnauthorized, "unauthorized")
	}
	return h.issueTokens(c, accountID, now)
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// RefreshSession rotates the refresh token on every use: the presented token
// is consumed atomically and a fresh pair is issued.
func (h *Handlers) RefreshSession(c *fiber.Ctx) error {
	var req refreshRequest
	if err := c.BodyParser(&req); err != nil || req.RefreshToken == "" {
		return errJSON(c, fiber.StatusBadRequest, "bad_request")
	}
	accountID, err := h.store.ConsumeRefreshToken(c.Context(), auth.HashRefreshToken(req.RefreshToken))
	if err != nil {
		return errJSON(c, fiber.StatusUnauthorized, "unauthorized")
	}
	return h.issueTokens(c, accountID, time.Now())
}

func (h *Handlers) issueTokens(c *fiber.Ctx, accountID uuid.UUID, now time.Time) error {
	access, err := h.issuer.IssueAccessToken(accountID, now)
	if err != nil {
		return errJSON(c, fiber.StatusInternalServerError, "token_failed")
	}
	refresh, refreshHash, err := auth.NewRefreshToken()
	if err != nil {
		return errJSON(c, fiber.StatusInternalServerError, "token_failed")
	}
	if err := h.store.InsertRefreshToken(c.Context(), refreshHash, accountID, now.Add(auth.RefreshTokenTTL)); err != nil {
		return errJSON(c, fiber.StatusInternalServerError, "store_failed")
	}
	return c.JSON(fiber.Map{
		"access_token":  access,
		"refresh_token": refresh,
		"expires_in":    int(auth.AccessTokenTTL.Seconds()),
	})
}

// DeleteSession invalidates all refresh tokens for the account (logout).
func (h *Handlers) DeleteSession(c *fiber.Ctx) error {
	accountID := AccountID(c)
	if err := h.store.DeleteAccountRefreshTokens(c.Context(), accountID); err != nil {
		return errJSON(c, fiber.StatusInternalServerError, "store_failed")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ── prekeys ──────────────────────────────────────────────────────────────────

// GetPrekeyBundle serves a peer's bundle for X3DH, consuming one one-time
// prekey atomically (single-use by design).
func (h *Handlers) GetPrekeyBundle(c *fiber.Ctx) error {
	if !h.prekeyLimit.Allow(AccountID(c).String()) {
		return errJSON(c, fiber.StatusTooManyRequests, "rate_limited")
	}
	userID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return errJSON(c, fiber.StatusBadRequest, "bad_user")
	}
	ctx := c.Context()
	identityKey, err := h.store.GetAccountIdentityKey(ctx, userID)
	if err != nil {
		return errJSON(c, fiber.StatusNotFound, "not_found")
	}
	spk, err := h.store.GetLatestSignedPrekey(ctx, userID)
	if err != nil {
		return errJSON(c, fiber.StatusNotFound, "not_found")
	}
	bundle := fiber.Map{
		"user_id":      userID,
		"identity_key": base64.StdEncoding.EncodeToString(identityKey),
		"signed_prekey": fiber.Map{
			"id":         spk.ID,
			"public_key": base64.StdEncoding.EncodeToString(spk.PublicKey),
			"signature":  base64.StdEncoding.EncodeToString(spk.Signature),
		},
		"one_time_prekey": nil,
	}
	if otp, err := h.store.ConsumeOneTimePrekey(ctx, userID); err == nil {
		bundle["one_time_prekey"] = fiber.Map{
			"id":         otp.ID,
			"public_key": base64.StdEncoding.EncodeToString(otp.PublicKey),
		}
	}
	return c.JSON(bundle)
}

type prekeyUploadRequest struct {
	SignedPrekey   *prekeyJSON  `json:"signed_prekey,omitempty"`
	OneTimePrekeys []prekeyJSON `json:"one_time_prekeys"`
}

// UploadPrekeys replenishes one-time prekeys and optionally rotates the
// signed prekey (clients rotate every 7 days).
func (h *Handlers) UploadPrekeys(c *fiber.Ctx) error {
	accountID := AccountID(c)
	var req prekeyUploadRequest
	if err := c.BodyParser(&req); err != nil {
		return errJSON(c, fiber.StatusBadRequest, "bad_request")
	}
	ctx := c.Context()
	if req.SignedPrekey != nil {
		identityKey, err := h.store.GetAccountIdentityKey(ctx, accountID)
		if err != nil {
			return errJSON(c, fiber.StatusInternalServerError, "store_failed")
		}
		pub, err1 := base64.StdEncoding.DecodeString(req.SignedPrekey.PublicKey)
		sig, err2 := base64.StdEncoding.DecodeString(req.SignedPrekey.Signature)
		if err1 != nil || err2 != nil || len(pub) != 32 || !ed25519.Verify(identityKey, pub, sig) {
			return errJSON(c, fiber.StatusBadRequest, "bad_signed_prekey")
		}
		if err := h.store.UpsertSignedPrekey(ctx, accountID, req.SignedPrekey.ID, pub, sig); err != nil {
			return errJSON(c, fiber.StatusInternalServerError, "store_failed")
		}
	}
	otps := make(map[int32][]byte, len(req.OneTimePrekeys))
	for _, p := range req.OneTimePrekeys {
		pub, err := base64.StdEncoding.DecodeString(p.PublicKey)
		if err != nil || len(pub) != 32 {
			return errJSON(c, fiber.StatusBadRequest, "bad_one_time_prekey")
		}
		otps[p.ID] = pub
	}
	if err := h.store.InsertOneTimePrekeys(ctx, accountID, otps, h.cfg.MaxPrekeysPerUser); err != nil {
		return errJSON(c, fiber.StatusInternalServerError, "store_failed")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handlers) PrekeyCount(c *fiber.Ctx) error {
	count, err := h.store.CountOneTimePrekeys(c.Context(), AccountID(c))
	if err != nil {
		return errJSON(c, fiber.StatusInternalServerError, "store_failed")
	}
	return c.JSON(fiber.Map{"count": count})
}

// ── account ──────────────────────────────────────────────────────────────────

// DeleteAccount is a full, irreversible purge of all data for the account.
func (h *Handlers) DeleteAccount(c *fiber.Ctx) error {
	if err := h.store.DeleteAccount(c.Context(), AccountID(c)); err != nil {
		return errJSON(c, fiber.StatusInternalServerError, "store_failed")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ── auth middleware ──────────────────────────────────────────────────────────

const accountIDKey = "sub_account_id"

// RequireAuth validates the JWT on every authenticated endpoint.
func (h *Handlers) RequireAuth(c *fiber.Ctx) error {
	header := c.Get("Authorization")
	token, ok := strings.CutPrefix(header, "Bearer ")
	if !ok || token == "" {
		return errJSON(c, fiber.StatusUnauthorized, "unauthorized")
	}
	accountID, err := h.issuer.ValidateAccessToken(token)
	if err != nil {
		return errJSON(c, fiber.StatusUnauthorized, "unauthorized")
	}
	c.Locals(accountIDKey, accountID)
	return c.Next()
}

func AccountID(c *fiber.Ctx) uuid.UUID {
	return c.Locals(accountIDKey).(uuid.UUID)
}
