// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package config

import (
	"fmt"
	"os"
	"strconv"
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
	}
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTPrivateKeyPath == "" || cfg.JWTPublicKeyPath == "" {
		return nil, fmt.Errorf("JWT_PRIVATE_KEY_PATH and JWT_PUBLIC_KEY_PATH are required")
	}
	return cfg, nil
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
