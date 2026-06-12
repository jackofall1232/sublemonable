# Contributing to Sublemonable

## Before contributing

Read [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md). All contributions must maintain the
zero-knowledge architecture: the server must never be able to see, store, or log plaintext message
content under any circumstances.

## Welcome contributions

- Bug fixes
- Security improvements
- Performance improvements
- Documentation
- Translations
- New platform support

## Hard rules — never do this

- Add server-side message logging of any kind
- Weaken encryption defaults
- Add analytics, telemetry, or crash reporting
- Store user-identifiable metadata
- Change cryptography without a detailed explanation reviewed by a maintainer

PRs that violate these rules will be closed regardless of code quality.

## PR process

1. Fork and create a feature branch
2. Write or update tests
3. Run the full test suite locally
4. Open a PR with a clear description of what changed and why
5. Expect security-sensitive PRs to take longer to review

## Code style

- **Go:** `gofmt` + `golangci-lint`
- **TypeScript:** ESLint + Prettier
- **Swift:** SwiftLint
- **Kotlin:** ktlint

Every source file carries an AGPL-3.0 license header — keep it on new files.
