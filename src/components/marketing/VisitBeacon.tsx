"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Avisa al servidor de que alguien ha entrado, UNA vez por pestaña y sesión, para el contador de
 * visitantes únicos del panel. No guarda nada en el navegador salvo esa marca de sesión (que
 * desaparece al cerrar la pestaña), respeta «No rastrear» y el control global de privacidad, y no
 * cuenta el panel de administración.
 */
export function VisitBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;
    try {
      if (window.sessionStorage.getItem("rs.visit")) return;
      window.sessionStorage.setItem("rs.visit", "1");
    } catch {
      return; // sin almacenamiento de sesión: mejor no contar que contar en cada página
    }
    void fetch("/api/visit", { method: "POST", keepalive: true }).catch(() => undefined);
  }, [pathname]);
  return null;
}
