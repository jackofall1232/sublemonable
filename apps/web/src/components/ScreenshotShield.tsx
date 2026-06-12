// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Screenshot protection for the browser: the instant the window loses focus
// or visibility (the moment OS capture UIs activate), the message container
// blurs and desaturates — within 120ms, jarring on purpose. Full OS-level
// prevention is impossible in a browser; this is the documented best effort.

import { useEffect, useState } from "react";
import { CaptureWarningOverlay } from "@sublemonable/ui";

export const MESSAGES_CONTAINER_ID = "messages-container";

export function useCaptureShield(): boolean {
  const [shielded, setShielded] = useState(false);

  useEffect(() => {
    const apply = (on: boolean) => {
      setShielded(on);
      const el = document.getElementById(MESSAGES_CONTAINER_ID);
      el?.classList.toggle("sub-capture-blur", on);
    };
    const onVisibility = () => apply(document.visibilityState !== "visible");
    const onBlur = () => apply(true);
    const onFocus = () => apply(false);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return shielded;
}

/** Heuristic DevTools detection — warn the session, never block it. */
export function useDevToolsWarning(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => {
      const gap = 170;
      setOpen(
        window.outerWidth - window.innerWidth > gap || window.outerHeight - window.innerHeight > gap,
      );
    };
    check();
    const id = setInterval(check, 2000);
    window.addEventListener("resize", check);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", check);
    };
  }, []);
  return open;
}

export function ScreenshotShield() {
  const shielded = useCaptureShield();
  return <CaptureWarningOverlay visible={shielded} />;
}
