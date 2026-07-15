// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
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

// Real libsignal-client vectors (generated via IdentityKeyPair.generate() +
// Curve.calculateSignature() — the exact client code path, see xeddsa_test.go
// for provenance/regeneration notes), NOT ed25519.GenerateKey/ed25519.Sign.
// A plain-Ed25519 keypair does not exercise VerifyLogin's real code path:
// identity keys are Curve25519, signed with XEdDSA (VerifyXEdDSA), and a
// self-generated Go-side Ed25519 signature would pass a Go-side Ed25519
// checker trivially without proving the actual client/server contract works.
const (
	loginTestIdentityRaw32B64 = "qpblp1zlEzle3zMgnFcP8EMULiHr9nFwrb3IVXOENzw="
	loginTestOtherRaw32B64    = "wcicHYcoPMrc9XU8FdZOqbIqQBH7Q7i4u/Afk9t1sRo="
	loginTestAccountID        = "11111111-2222-3333-4444-555555555555"
	loginTestNowTs            = 1752000000
	loginTestStaleTs          = 1751999400 // 10 minutes earlier — outside LoginSkew
	loginTestNowSigB64        = "gaL/TAfrRBeaTywNKGF6xucK8off6cDrRn9zrIe0Z7PHDzUFu7VW4RvDC0IMB4Nt3YNsoUXb5KrLk8TA3FpRhA=="
	loginTestStaleSigB64      = "V6ZAAhwyBOhA/78gqECM1k1sAoPkC4m7OI6tIzn6vqr7e8JUtEBdvy5gxN9MB3QzEaf2JRZ77NpV7gBdpMVIjg=="
)

func TestLoginChallenge(t *testing.T) {
	pub := mustB64(t, loginTestIdentityRaw32B64)
	accountID := uuid.MustParse(loginTestAccountID)
	now := time.Unix(loginTestNowTs, 0)
	sig := mustB64(t, loginTestNowSigB64)

	if err := VerifyLogin(pub, accountID, now, sig, now); err != nil {
		t.Fatalf("valid login rejected: %v", err)
	}
	// Replayed outside the window — a cryptographically VALID signature over
	// a stale timestamp must still be rejected on the time check.
	stale := time.Unix(loginTestStaleTs, 0)
	staleSig := mustB64(t, loginTestStaleSigB64)
	if err := VerifyLogin(pub, accountID, stale, staleSig, now); err == nil {
		t.Fatal("stale login accepted")
	}
	// Signature by the wrong key
	otherPub := mustB64(t, loginTestOtherRaw32B64)
	if err := VerifyLogin(otherPub, accountID, now, sig, now); err == nil {
		t.Fatal("forged login accepted")
	}
	// Tampered signature (single bit flip)
	tampered := append([]byte(nil), sig...)
	tampered[0] ^= 0x01
	if err := VerifyLogin(pub, accountID, now, tampered, now); err == nil {
		t.Fatal("tampered signature accepted")
	}
}

func mustB64(t *testing.T, s string) []byte {
	t.Helper()
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		t.Fatal(err)
	}
	return b
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
