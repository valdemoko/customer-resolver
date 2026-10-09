"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

/** Cierra la sesión (borra la cookie) y recarga la página. */
export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          window.location.assign("/cuenta");
        }
      }}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-sm text-ink transition-colors hover:border-accent/60 hover:text-accent-ink disabled:opacity-60"
    >
      <LogOut size={14} strokeWidth={2} aria-hidden="true" />
      Cerrar sesión
    </button>
  );
}
