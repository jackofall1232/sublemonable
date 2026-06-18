// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import { LemonSlice, SEGMENT_COUNT } from "./LemonSlice.js";
import { color, motion, typography } from "./tokens.js";

export interface PassphraseSetupProps {
  /** "setup" asks for confirmation; "unlock" is a single field */
  mode: "setup" | "unlock";
  onSubmit: (passphrase: string) => void;
  busy?: boolean;
  error?: string;
}

/**
 * Passphrase screen: a large lemon slice whose segments illuminate as the
 * passphrase strengthens (setup) or fills fully on input (unlock).
 */
export function PassphraseSetup({ mode, onSubmit, busy = false, error }: PassphraseSetupProps) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");

  const strength =
    mode === "setup" ? passphraseStrength(passphrase) : passphrase ? SEGMENT_COUNT : 0;
  const confirmed = mode === "unlock" || (confirm.length > 0 && confirm === passphrase);
  const canSubmit =
    !busy && passphrase.length > 0 && (mode === "unlock" || (strength >= 5 && confirmed));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(passphrase);
      }}
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        background: color.semantic.backgroundPrimary,
        padding: 32,
      }}
    >
      {busy ? (
        <LemonSlice variant="loading_spinner" size={96} label="Deriving keys" />
      ) : (
        <LemonSlice
          variant="security_indicator"
          segments={strength}
          size={96}
          label="Passphrase strength"
        />
      )}

      <h1
        style={{
          color: color.semantic.textPrimary,
          fontFamily: typography.display.family,
          fontWeight: 600,
          fontSize: "1.5rem",
          letterSpacing: typography.display.letterSpacing,
          margin: 0,
        }}
      >
        {mode === "setup" ? "Choose a passphrase" : "Unlock"}
      </h1>
      <p
        style={{
          color: color.semantic.textSecondary,
          fontFamily: typography.body.family,
          fontSize: "0.875rem",
          margin: 0,
          maxWidth: 320,
          textAlign: "center",
        }}
      >
        {mode === "setup"
          ? "Your keys are encrypted with this. We can't reset it — nobody can."
          : "Enter your passphrase to decrypt your keys."}
      </p>

      <PassphraseField
        value={passphrase}
        onChange={setPassphrase}
        placeholder="Passphrase"
        autoFocus
        disabled={busy}
      />
      {mode === "setup" && (
        <PassphraseField
          value={confirm}
          onChange={setConfirm}
          placeholder="Confirm passphrase"
          disabled={busy}
        />
      )}

      {error && (
        <span
          role="alert"
          style={{
            color: color.semantic.error,
            fontFamily: typography.body.family,
            fontSize: "0.875rem",
          }}
        >
          {error}
        </span>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          background: canSubmit ? color.core.lemon : color.semantic.backgroundElevated,
          color: canSubmit ? color.semantic.textOnLemon : color.semantic.textMuted,
          fontFamily: typography.body.family,
          fontWeight: 500,
          fontSize: "0.9375rem",
          border: "none",
          borderRadius: 9999,
          padding: "12px 40px",
          cursor: canSubmit ? "pointer" : "not-allowed",
          transition: `background ${motion.durationBase} ${motion.easingDefault}`,
        }}
      >
        {mode === "setup" ? "Create key store" : "Unlock"}
      </button>
    </form>
  );
}

function PassphraseField({
  value,
  onChange,
  placeholder,
  autoFocus,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      autoComplete="off"
      style={{
        width: 280,
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${focused ? color.core.lemon : color.semantic.border}`,
        color: color.semantic.textPrimary,
        fontFamily: typography.body.family,
        fontSize: "1.125rem",
        textAlign: "center",
        padding: "8px 4px",
        outline: "none",
        transition: "border-color 200ms",
      }}
    />
  );
}

/** Map a passphrase to 0–8 illuminated segments. Length-dominant on purpose. */
export function passphraseStrength(passphrase: string): number {
  if (!passphrase) return 0;
  let score = Math.min(5, Math.floor(passphrase.length / 4));
  if (/[a-z]/.test(passphrase) && /[A-Z]/.test(passphrase)) score += 1;
  if (/\d/.test(passphrase)) score += 1;
  if (/[^a-zA-Z0-9]/.test(passphrase)) score += 1;
  return Math.min(SEGMENT_COUNT, score);
}
