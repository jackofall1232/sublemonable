// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package main

import (
	"context"
	"errors"
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
		// Preserve intentional HTTP statuses (fiber.ErrUnauthorized /
		// fiber.ErrUpgradeRequired from the /ws middleware below). Flattening
		// everything to 500 made an auth-rejected WebSocket handshake
		// indistinguishable from a server bug: clients key their re-auth
		// logic off 401/403, and a 500 sent them into a blind reconnect loop
		// instead. Bodies stay generic codes — never error internals.
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			var fe *fiber.Error
			if errors.As(err, &fe) && fe.Code < fiber.StatusInternalServerError {
				code := "error"
				switch fe.Code {
				case fiber.StatusUnauthorized:
					code = "unauthorized"
				case fiber.StatusUpgradeRequired:
					code = "upgrade_required"
				}
				return c.Status(fe.Code).JSON(fiber.Map{"error": code})
			}
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

	// Dead drops (v1.5) — anonymous, unauthenticated. Proof-of-work on deposit
	// stands in for auth; redemption is gated only by the one-time token.
	v1.Post("/drops", handlers.DepositDrop)
	v1.Post("/drops/redeem", handlers.RedeemDrop)

	// Multi-hop relay forwarding (v1.5). Served only when this deployment is
	// configured as a relay node (RELAY_PRIVATE_KEY set).
	if handlers.RelayEnabled() {
		app.Post("/relay/forward", handlers.RelayForward)
	}

	// Authenticated WebSocket for real-time delivery. The token rides the
	// Sec-WebSocket-Protocol header (browser WebSocket API can't set
	// Authorization), or a query param as a fallback for native clients.
	app.Use("/ws", func(c *fiber.Ctx) error {
		if !websocket.IsWebSocketUpgrade(c) {
			return fiber.ErrUpgradeRequired
		}
		token := c.Get("Sec-WebSocket-Protocol")
		fromHeader := token != ""
		if !fromHeader {
			token = c.Query("token")
		}
		accountID, err := issuer.ValidateAccessToken(token)
		if err != nil {
			return fiber.ErrUnauthorized
		}
		// RFC 6455 §4.1: a browser that offered a subprotocol MUST close the
		// connection when the server's 101 doesn't select one. Echo the token
		// back (the upgrader forwards a pre-set response header as the selected
		// subprotocol), or web clients drop the socket right after the
		// handshake. Only when the client actually offered it — selecting a
		// subprotocol a query-param client never requested is equally fatal.
		if fromHeader {
			c.Set("Sec-WebSocket-Protocol", token)
		}
		c.Locals("ws_account_id", accountID)
		return c.Next()
	})
	app.Get("/ws", websocket.New(func(conn *websocket.Conn) {
		hub.Serve(conn.Locals("ws_account_id").(uuid.UUID), conn)
	}))

	// Health endpoint — operator diagnostics and the §10 testing checklist.
	// Returns transport status; accessible over Tor relay onion and clearnet alike.
	app.Get("/healthz", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":      "ok",
			"tor_enabled": cfg.TorEnabled,
			"i2p_enabled": cfg.I2PEnabled,
			"i2p_dest":    cfg.I2PEepsiteDest,
		})
	})

	// Onion mirror: when running as a Tor hidden service with a site directory
	// configured, serve a static no-JS mirror (APK download, checksums,
	// self-hosting instructions). Registered after the API routes so they always
	// take precedence, and Host-gated so the mirror answers only over the hidden
	// service — a hybrid box keeps the clearnet API while never exposing the
	// mirror off-Tor. See registerOnionMirror in onion.go.
	if cfg.TorEnabled && cfg.OnionSiteDir != "" {
		registerOnionMirror(app, cfg)
	}

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
