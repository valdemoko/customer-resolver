"use client";

/**
 * PlausibleLoader — Resolveo.
 *
 * Loads Plausible Analytics in production only.
 * Plausible is cookieless and does not require consent under GDPR/ePrivacy.
 * No CMP integration needed for Plausible.
 */
import { useEffect } from "react";

const SCRIPT_SRC = "https://plausible.io/js/script.js";
const SCRIPT_ID = "plausible-script";

export function PlausibleLoader({ domain }: { domain: string }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.defer = true;
    script.dataset.domain = domain;
    script.src = SCRIPT_SRC;
    document.head.appendChild(script);
  }, [domain]);

  return null;
}
