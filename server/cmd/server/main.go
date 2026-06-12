// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package main

import (
	"context"
	"fmt"
	"log"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/sublemonable/server/internal/api"
	"github.com/sublemonable/server/internal/auth"
	"github.com/sublemonable/server/internal/config"
	"github.com/sublemonable/server/internal/db"
	"github.com/sublemonable/server/internal/janitor"
	"github.com/sublemonable/server/internal/ratelimit"
	"github.com/sublemonable/server/internal/ws"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	store, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer store.Close()

	issuer, err := auth.NewIssuer(cfg.JWTPrivateKeyPath, cfg.JWTPublicKeyPath)
	if err != nil {
		log.Fatalf("auth: %v", err)
	}

	handlers := api.New(store, issuer, cfg)
	sendLimit := ratelimit.New(100, time.Minute, cfg.RateLimitEnabled)
	hub := ws.NewHub(store, sendLimit)

	// No access logging, no body logging — application errors only.
	app := fiber.New(fiber.Config{
		DisableStartupMessage: false,
		BodyLimit:             512 * 1024,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal"})
		},
	})

	app.Use(securityHeaders)

	v1 := app.Group("/api/v1")
	v1.Post("/register", handlers.Register)
	v1.Post("/session", handlers.CreateSession)
	v1.Post("/session/refresh", handlers.RefreshSession)
	v1.Delete("/session", handlers.RequireAuth, handlers.DeleteSession)
	v1.Get("/users/:id/prekey", handlers.RequireAuth, handlers.GetPrekeyBundle)
	v1.Post("/prekeys", handlers.RequireAuth, handlers.UploadPrekeys)
	v1.Get("/prekeys/count", handlers.RequireAuth, handlers.PrekeyCount)
	v1.Delete("/account", handlers.RequireAuth, handlers.DeleteAccount)

	// Authenticated WebSocket for real-time delivery. The token rides the
	// Sec-WebSocket-Protocol header (browser WebSocket API can't set
	// Authorization), or a query param as a fallback for native clients.
	app.Use("/ws", func(c *fiber.Ctx) error {
		if !websocket.IsWebSocketUpgrade(c) {
			return fiber.ErrUpgradeRequired
		}
		token := c.Get("Sec-WebSocket-Protocol")
		if token == "" {
			token = c.Query("token")
		}
		accountID, err := issuer.ValidateAccessToken(token)
		if err != nil {
			return fiber.ErrUnauthorized
		}
		c.Locals("ws_account_id", accountID)
		return c.Next()
	})
	app.Get("/ws", websocket.New(func(conn *websocket.Conn) {
		hub.Serve(conn.Locals("ws_account_id").(uuid.UUID), conn)
	}))

	go janitor.Run(ctx, store, time.Duration(cfg.MessageTTLUndeliveredHours)*time.Hour)

	go func() {
		addr := fmt.Sprintf(":%d", cfg.ServerPort)
		var err error
		if cfg.TLSCertPath != "" && cfg.TLSKeyPath != "" {
			err = app.ListenTLS(addr, cfg.TLSCertPath, cfg.TLSKeyPath)
		} else {
			// Plain HTTP — only behind a TLS-terminating reverse proxy.
			err = app.Listen(addr)
		}
		if err != nil {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	_ = app.ShutdownWithTimeout(10 * time.Second)
}

// securityHeaders applies the transport hardening headers from the security spec.
func securityHeaders(c *fiber.Ctx) error {
	c.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
	c.Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; connect-src 'self' wss:")
	c.Set("X-Frame-Options", "DENY")
	c.Set("X-Content-Type-Options", "nosniff")
	c.Set("Referrer-Policy", "no-referrer")
	c.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
	return c.Next()
}
