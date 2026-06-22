// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package main

import (
	"bytes"
	"html/template"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/filesystem"

	"github.com/sublemonable/server/internal/config"
)

// registerOnionMirror registers the static no-JS APK mirror on the public and
// secret onion addresses. The relay onion address serves only the API — it
// intentionally has no mirror so the relay service is not correlated with the
// download service by an observer watching both onions.
//
// Host-gating logic:
//
//	Host == PUBLIC_ONION_ADDRESS  -> serve mirror
//	Host == SECRET_ONION_ADDRESS  -> serve mirror (identical content)
//	Host == RELAY_ONION_ADDRESS   -> fall through to API (no mirror)
//	Host == clearnet hostname     -> fall through to API (no mirror)
//
// This makes a hybrid deployment safe: the clearnet 8443 port can stay published
// for the API (behind a reverse proxy), yet ordinary clearnet / IP-scanner
// traffic (any non-mirror Host) never reaches the mirror and instead falls
// through to the API routes.
//
// Fails closed: an empty address never matches, so a misconfigured deployment
// serves no mirror rather than leaking it onto every Host.
//
// The download link degrades gracefully: the APK is gitignored and must be
// staged by the operator, so when no *.apk is present in the site directory the
// page hides the download/verify section and shows staging guidance instead of
// linking to a dead 404.
func registerOnionMirror(app *fiber.App, cfg *config.Config) {
	dir := cfg.OnionSiteDir
	if dir == "" || !cfg.TorEnabled {
		return
	}
	indexPath := filepath.Join(dir, "index.html")

	// renderIndex serves the index page as an html/template, toggling the
	// download section on whether an APK has been staged. Host-gated; non-mirror
	// requests fall through (c.Next -> ultimately a 404, no mirror).
	renderIndex := func(c *fiber.Ctx) error {
		if !isMirrorHost(c, cfg) {
			return c.Next()
		}
		raw, err := os.ReadFile(indexPath)
		if err != nil {
			return c.Next()
		}
		tmpl, err := template.New("index").Parse(string(raw))
		if err != nil {
			return c.Next()
		}
		apkName, apkAvailable := findStagedAPK(dir)
		var buf bytes.Buffer
		// The template displays the canonical (public) onion address. The secret
		// and relay addresses are NEVER passed to the template or any response.
		if err := tmpl.Execute(&buf, map[string]any{
			"OnionAddress": cfg.PublicOnionAddress,
			"APKName":      apkName,
			"APKAvailable": apkAvailable,
		}); err != nil {
			return c.Next()
		}
		c.Type("html")
		return c.Send(buf.Bytes())
	}

	app.Get("/", renderIndex)
	app.Get("/index.html", renderIndex)

	// Static assets (style.css, SHA256SUMS, the staged .apk). Same Host gate;
	// missing/unmatched files fall through to a 404 without touching the API,
	// which is registered earlier in the middleware chain.
	app.Use("/", filesystem.New(filesystem.Config{
		Root:   http.Dir(dir),
		Browse: false,
		Next: func(c *fiber.Ctx) bool {
			return !isMirrorHost(c, cfg)
		},
	}))
}

// isMirrorHost returns true when the request Host matches the public or secret
// onion address. The relay onion address is explicitly excluded — it serves the
// API only, so the relay onion is never correlated with the download mirror.
func isMirrorHost(c *fiber.Ctx, cfg *config.Config) bool {
	host := normaliseHost(c.Hostname())
	if host == "" {
		return false
	}
	pub := normaliseHost(cfg.PublicOnionAddress)
	sec := normaliseHost(cfg.SecretOnionAddress)
	// relay address intentionally not matched here
	return (pub != "" && host == pub) || (sec != "" && host == sec)
}

// normaliseHost strips any :port suffix and lowercases. An empty input yields an
// empty string, which never matches a configured address — the fail-closed case.
func normaliseHost(h string) string {
	if i := strings.IndexByte(h, ':'); i >= 0 {
		h = h[:i]
	}
	return strings.ToLower(strings.TrimSpace(h))
}

// findStagedAPK returns the basename of the first *.apk in dir and whether one
// exists. The APK is never committed (it is .gitignored); operators stage it
// into the mirror directory before enabling the hidden service.
func findStagedAPK(dir string) (string, bool) {
	matches, err := filepath.Glob(filepath.Join(dir, "*.apk"))
	if err != nil || len(matches) == 0 {
		return "", false
	}
	return filepath.Base(matches[0]), true
}
