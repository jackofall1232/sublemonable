// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package auth

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
)

func testIssuer(t *testing.T) *Issuer {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	privPath := filepath.Join(dir, "jwt.pem")
	pubPath := filepath.Join(dir, "jwt.pub.pem")

	privDER, _ := x509.MarshalPKCS8PrivateKey(key)
	os.WriteFile(privPath, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privDER}), 0o600)
	pubDER, _ := x509.MarshalPKIXPublicKey(&key.PublicKey)
	os.WriteFile(pubPath, pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: pubDER}), 0o644)

	issuer, err := NewIssuer(privPath, pubPath)
	if err != nil {
		t.Fatal(err)
	}
	return issuer
}

func TestAccessTokenRoundTrip(t *testing.T) {
	issuer := testIssuer(t)
	accountID := uuid.New()
	token, err := issuer.IssueAccessToken(accountID, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	got, err := issuer.ValidateAccessToken(token)
	if err != nil {
		t.Fatal(err)
	}
	if got != accountID {
		t.Fatalf("got %s, want %s", got, accountID)
	}
}

func TestExpiredTokenRejected(t *testing.T) {
	issuer := testIssuer(t)
	token, err := issuer.IssueAccessToken(uuid.New(), time.Now().Add(-AccessTokenTTL-time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := issuer.ValidateAccessToken(token); err == nil {
		t.Fatal("expired token validated")
	}
}

func TestTamperedTokenRejected(t *testing.T) {
	issuer := testIssuer(t)
	token, _ := issuer.IssueAccessToken(uuid.New(), time.Now())
	tampered := token[:len(token)-4] + "AAAA"
	if _, err := issuer.ValidateAccessToken(tampered); err == nil {
		t.Fatal("tampered token validated")
	}
}

func TestLoginChallenge(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	accountID := uuid.New()
	now := time.Now()
	sig := ed25519.Sign(priv, LoginMessage(accountID, now))

	if err := VerifyLogin(pub, accountID, now, sig, now); err != nil {
		t.Fatalf("valid login rejected: %v", err)
	}
	// Replayed outside the window
	stale := now.Add(-LoginSkew - time.Minute)
	staleSig := ed25519.Sign(priv, LoginMessage(accountID, stale))
	if err := VerifyLogin(pub, accountID, stale, staleSig, now); err == nil {
		t.Fatal("stale login accepted")
	}
	// Signature by the wrong key
	otherPub, _, _ := ed25519.GenerateKey(rand.Reader)
	if err := VerifyLogin(otherPub, accountID, now, sig, now); err == nil {
		t.Fatal("forged login accepted")
	}
}

func TestRefreshTokenHashing(t *testing.T) {
	token, hash, err := NewRefreshToken()
	if err != nil {
		t.Fatal(err)
	}
	if string(HashRefreshToken(token)) != string(hash) {
		t.Fatal("hash mismatch")
	}
	other, _, _ := NewRefreshToken()
	if other == token {
		t.Fatal("refresh tokens not unique")
	}
}
