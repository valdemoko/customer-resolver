"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMarketState } from "@/lib/market/client";
import type { MarketState, UnitView } from "@/lib/market/types";
import { BASE_PRICE_CENTS } from "@/lib/market/types";

/**
 * Estado del mercado en el visor: carga las unidades compradas, las refresca cada
 * 25 s (otra persona puede haber comprado) y tras cada compra propia, y entrega
 * al motor el listado para teñir y pintar fotos.
 */
export function useMarket(onState: (state: MarketState) => void) {
  const [state, setState] = useState<MarketState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const callback = useRef(onState);
  callback.current = onState;
  const lastVersion = useRef("");

  const refresh = useCallback(async () => {
    try {
      const next = await fetchMarketState();
      setError(null);
      setState(next);
      if (next.version !== lastVersion.current) {
        lastVersion.current = next.version;
        callback.current(next);
      }
      return next;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo leer el mercado.");
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 25_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const byId = useMemo(() => new Map((state?.units ?? []).map((unit) => [unit.id, unit])), [state]);

  /** Vista de una unidad; si nadie la ha comprado, la de «disponible por 1,00 €». */
  const freeIds = useMemo(() => new Set(state?.free ?? []), [state]);
  const unit = useCallback(
    (id: string): UnitView => {
      const free = freeIds.has(id);
      return byId.get(id) ?? { id, purchases: 0, priceCents: free ? 0 : BASE_PRICE_CENTS, owned: false, free, rev: "0.0", lockedUntil: null, owner: null };
    },
    [byId, freeIds],
  );

  return { state, error, refresh, unit, purchasesEnabled: state?.purchasesEnabled ?? false };
}
