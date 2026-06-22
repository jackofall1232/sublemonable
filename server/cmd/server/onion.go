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

// registerOnionMirror serves the static no-JS mirror site (download page,
// stylesheet, checksums, staged APK) — but ONLY for requests whose Host header
// is this deployment's .onion address, i.e. requests that arrived through the
// hidden service.
//
// This makes a hybrid deployment safe: the clearnet 8443 port can stay published
// for the API (behind a reverse proxy), yet ordinary clearnet / IP-scanner
// traffic (any non-onion Host) never reaches the mirror and instead falls
// through to the API routes. The mirror's content is public, so Host gating is
// about not serving the Tor-only page to clearnet visitors — not a secret.
//
//	.onion Host    -> API works AND the static mirror is served
//	clearnet Host  -> API works, mirror routes return 404 / are not mounted
//
// The download link degrades gracefully: the APK is gitignored and must be
// staged by the operator, so when no *.apk is present in the site directory the
// page hides the download/verify section and shows staging guidance instead of
// linking to a dead 404.
func registerOnionMirror(app *fiber.App, cfg *config.Config) {
	dir := cfg.OnionSiteDir
	indexPath := filepath.Join(dir, "index.html")

	// renderIndex serves the index page as an html/template, toggling the
	// download section on whether an APK has been staged. Host-gated; clearnet
	// requests fall through (c.Next -> ultimately a 404, no mirror).
	renderIndex := func(c *fiber.Ctx) error {
		if !onionHost(c, cfg.OnionAddress) {
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
		if err := tmpl.Execute(&buf, map[string]any{
			"OnionAddress": cfg.OnionAddress,
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
			return !onionHost(c, cfg.OnionAddress)
		},
	}))
}

// onionHost reports whether the request's Host is the configured .onion address.
// Fails closed: an empty OnionAddress never matches, so a misconfigured Tor
// deployment serves no mirror rather than leaking it onto every Host.
func onionHost(c *fiber.Ctx, onion string) bool {
	if onion == "" {
		return false
	}
	host := c.Hostname()
	if i := strings.IndexByte(host, ':'); i >= 0 {
		host = host[:i] // strip any :port
	}
	return strings.EqualFold(host, onion)
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
