"use client";

import { useEffect, useState } from "react";
import type { LeaderboardsPayload } from "@/lib/market/service";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; data: LeaderboardsPayload };

let inflight: Promise<LeaderboardsPayload> | null = null;

async function fetchBoard(): Promise<LeaderboardsPayload> {
  const response = await fetch("/api/market/leaderboards");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as LeaderboardsPayload;
}

/** Una sola petición inicial por carga de página, compartida por todos los bloques que la usan. */
function loadFirst(): Promise<LeaderboardsPayload> {
  inflight ??= fetchBoard().catch((error: unknown) => {
    inflight = null;
    throw error;
  });
  return inflight;
}

/**
 * Cifras y clasificaciones de la ciudad. Con `pollMs` se vuelven a pedir con esa
 * cadencia mientras la pestaña está visible, para que una compra nueva aparezca sin recargar.
 */
export function useLeaderboards(pollMs = 0): State {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    loadFirst().then(
      (data) => alive && setState({ status: "ready", data }),
      () => alive && setState({ status: "error" }),
    );
    if (!pollMs) {
      return () => {
        alive = false;
      };
    }
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      fetchBoard().then(
        (data) => alive && setState({ status: "ready", data }),
        () => undefined, // un fallo puntual no tira abajo lo que ya se está viendo
      );
    }, pollMs);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [pollMs]);
  return state;
}
