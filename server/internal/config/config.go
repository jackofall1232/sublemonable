// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DatabaseURL                string
	JWTPrivateKeyPath          string
	JWTPublicKeyPath           string
	ServerPort                 int
	TLSCertPath                string
	TLSKeyPath                 string
	MaxPrekeysPerUser          int
	MessageTTLUndeliveredHours int
	RateLimitEnabled           bool
	TorEnabled                 bool
	// OnionSiteDir, when set and TorEnabled, is served as a static no-JS mirror
	// site (APK download + checksums + self-hosting instructions) at the root of
	// the hidden service. Empty disables it — clearnet deployments serve no site.
	OnionSiteDir string
	// v1.5 — Tor-first + dead drops + multi-hop relay.
	OnionAddress      string   // v3 .onion address this deployment is reachable at
	DropTTLHours      int      // dead-drop lifetime, collected or not
	DropPoWDifficulty int      // leading zero bits required on deposit proof-of-work
	RelayPrivateKey   string   // base64 Curve25519 private key; enables /relay/forward when set
	RelayPublicKey    string   // base64 Curve25519 public key advertised in the relay registry
	RelayPeers        []string // allowlist of next-hop forward URLs; forwarding fails closed otherwise
}

func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:                os.Getenv("DATABASE_URL"),
		JWTPrivateKeyPath:          os.Getenv("JWT_PRIVATE_KEY_PATH"),
		JWTPublicKeyPath:           os.Getenv("JWT_PUBLIC_KEY_PATH"),
		ServerPort:                 envInt("SERVER_PORT", 8443),
		TLSCertPath:                os.Getenv("TLS_CERT_PATH"),
		TLSKeyPath:                 os.Getenv("TLS_KEY_PATH"),
		MaxPrekeysPerUser:          envInt("MAX_PREKEYS_PER_USER", 100),
		MessageTTLUndeliveredHours: envInt("MESSAGE_TTL_UNDELIVERED_HOURS", 72),
		RateLimitEnabled:           envBool("RATE_LIMIT_ENABLED", true),
		TorEnabled:                 envBool("TOR_ENABLED", false),
		OnionSiteDir:               os.Getenv("ONION_SITE_DIR"),
		OnionAddress:               os.Getenv("ONION_ADDRESS"),
		DropTTLHours:               envInt("DROP_TTL_HOURS", 72),
		DropPoWDifficulty:          envInt("DROP_POW_DIFFICULTY", 20),
		RelayPrivateKey:            os.Getenv("RELAY_PRIVATE_KEY"),
		RelayPublicKey:             os.Getenv("RELAY_PUBLIC_KEY"),
		RelayPeers:                 splitCSV(os.Getenv("RELAY_PEERS")),
	}
	// A negative proof-of-work difficulty would make every nonce "valid" — never
	// trust a misconfigured value; fall back to the secure default.
	if cfg.DropPoWDifficulty < 0 {
		cfg.DropPoWDifficulty = 20
	}
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTPrivateKeyPath == "" || cfg.JWTPublicKeyPath == "" {
		return nil, fmt.Errorf("JWT_PRIVATE_KEY_PATH and JWT_PUBLIC_KEY_PATH are required")
	}
	return cfg, nil
}

// splitCSV parses a comma-separated env value into a trimmed, non-empty list.
func splitCSV(v string) []string {
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}
