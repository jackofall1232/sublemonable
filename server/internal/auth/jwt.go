// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package auth

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	AccessTokenTTL  = 15 * time.Minute
	RefreshTokenTTL = 7 * 24 * time.Hour
	// Login challenge timestamps must be within this window (replay protection).
	LoginSkew = 5 * time.Minute
)

type Issuer struct {
	private *rsa.PrivateKey
	public  *rsa.PublicKey
}

func NewIssuer(privateKeyPath, publicKeyPath string) (*Issuer, error) {
	priv, err := loadRSAPrivate(privateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("load private key: %w", err)
	}
	pub, err := loadRSAPublic(publicKeyPath)
	if err != nil {
		return nil, fmt.Errorf("load public key: %w", err)
	}
	return &Issuer{private: priv, public: pub}, nil
}

// IssueAccessToken mints a 15-minute RS256 JWT for the account.
func (i *Issuer) IssueAccessToken(accountID uuid.UUID, now time.Time) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   accountID.String(),
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(AccessTokenTTL)),
		Issuer:    "sublemonable",
	}
	return jwt.NewWithClaims(jwt.SigningMethodRS256, claims).SignedString(i.private)
}

// ValidateAccessToken verifies signature, expiry, and issuer, returning the
// account ID. Called on every authenticated endpoint.
func (i *Issuer) ValidateAccessToken(token string) (uuid.UUID, error) {
	parsed, err := jwt.ParseWithClaims(token, &jwt.RegisteredClaims{}, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodRS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return i.public, nil
	}, jwt.WithIssuer("sublemonable"), jwt.WithExpirationRequired())
	if err != nil {
		return uuid.Nil, err
	}
	claims := parsed.Claims.(*jwt.RegisteredClaims)
	return uuid.Parse(claims.Subject)
}

// ── login challenge ──────────────────────────────────────────────────────────

// LoginMessage is the byte string a client signs with its identity key to
// authenticate: there are no passwords, possession of the identity key IS
// the account. The message itself is identical across platforms — only the
// signing scheme differs (see VerifyLogin).
func LoginMessage(accountID uuid.UUID, timestamp time.Time) []byte {
	return []byte(fmt.Sprintf("sublemonable-login:%s:%d", accountID, timestamp.Unix()))
}

// VerifyLogin checks the timestamp window and the signature over the login
// challenge. Accepts either signing convention currently in use across
// clients: genuine Ed25519 (web/desktop, packages/crypto/src/keys.ts) or
// libsignal's XEdDSA over a Curve25519 key (Android/iOS) — see VerifyXEdDSA
// and .l00prite/ledger.md Run 14. Unlike the signed-prekey path, the message
// itself is identical either way, so both checks run over the same bytes.
func VerifyLogin(identityKey []byte, accountID uuid.UUID, timestamp time.Time, signature []byte, now time.Time) error {
	if len(identityKey) != ed25519.PublicKeySize {
		return fmt.Errorf("bad identity key length")
	}
	drift := now.Sub(timestamp)
	if drift < -LoginSkew || drift > LoginSkew {
		return fmt.Errorf("login timestamp outside window")
	}
	message := LoginMessage(accountID, timestamp)
	if !ed25519.Verify(identityKey, message, signature) && !VerifyXEdDSA(identityKey, message, signature) {
		return fmt.Errorf("signature verification failed")
	}
	return nil
}

// ── refresh tokens ───────────────────────────────────────────────────────────

// NewRefreshToken returns (opaque token for the client, SHA-256 hash for storage).
func NewRefreshToken() (string, []byte, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	hash := HashRefreshToken(token)
	return token, hash, nil
}

func HashRefreshToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// ── PEM loading ──────────────────────────────────────────────────────────────

func loadRSAPrivate(path string) (*rsa.PrivateKey, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(raw)
	if block == nil {
		return nil, fmt.Errorf("no PEM block")
	}
	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if rsaKey, ok := key.(*rsa.PrivateKey); ok {
			return rsaKey, nil
		}
		return nil, fmt.Errorf("not an RSA key")
	}
	return x509.ParsePKCS1PrivateKey(block.Bytes)
}

func loadRSAPublic(path string) (*rsa.PublicKey, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(raw)
	if block == nil {
		return nil, fmt.Errorf("no PEM block")
	}
	if key, err := x509.ParsePKIXPublicKey(block.Bytes); err == nil {
		if rsaKey, ok := key.(*rsa.PublicKey); ok {
			return rsaKey, nil
		}
		return nil, fmt.Errorf("not an RSA key")
	}
	return x509.ParsePKCS1PublicKey(block.Bytes)
}
