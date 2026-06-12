# Security Policy

## Reporting a vulnerability

**Do NOT open a public issue.** Report vulnerabilities through
[GitHub private security advisories](../../security/advisories/new) so the issue stays private
until a fix ships.

## What to include

- A description of the vulnerability
- Reproduction steps (proof of concept if possible)
- Potential impact as you understand it
- A suggested fix, if you have one

## Response timeline

- **Acknowledgement:** within 48 hours
- **Fix target:** within 90 days of a confirmed vulnerability

## Scope

### In scope

- `server` — the Go message relay
- `apps/web` — the browser client
- `apps/ios` — the iOS app
- `apps/android` — the Android app
- `packages/crypto` — crypto primitives and Signal Protocol wrapper
- `packages/protocol` — message format and serialization

### Out of scope

- Third-party dependencies (report upstream; we'll still appreciate a heads-up)
- Social engineering

## Recognition

Valid disclosures are credited in [AUDIT.md](AUDIT.md) and in release notes, unless you prefer to
remain anonymous.

## Safe harbor

Good-faith security research conducted under this policy is authorized. We will not pursue legal
action against researchers who follow it.
