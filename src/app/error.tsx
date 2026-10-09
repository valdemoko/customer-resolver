"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Button, ButtonLink } from "@/components/ui/Button";

/**
 * Error de conexión / fallo de render.
 *
 * `reset()` vuelve a renderizar el segmento sin recargar la aplicación: no se
 * pierde el estado de los filtros ni el usuario aterriza en una pantalla en
 * blanco.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Los registros estructurados llegan en la Fase D (observabilidad).
    console.error("[catalogo] fallo de render", { digest: error.digest });
  }, [error]);

  return (
    <>
      <TopBar />
      <main className="mx-auto flex max-w-2xl flex-col items-start px-4 py-24 sm:px-6">
        <TriangleAlert size={30} strokeWidth={1.4} aria-hidden="true" className="text-premium" />
        <h1 className="display-face mt-5 text-3xl font-semibold tracking-[-0.03em] text-ink">
          No hemos podido cargar el catálogo
        </h1>
        <p className="mt-3 text-base text-muted">
          Puede ser un problema de conexión. Tus filtros y ciudades guardadas siguen donde
          estaban.
        </p>
        <div className="mt-7 flex gap-3">
          <Button variant="primary" onClick={reset}>
            <RefreshCw size={15} strokeWidth={2} aria-hidden="true" />
            Reintentar
          </Button>
          <ButtonLink href="/" variant="secondary">
            Volver al inicio
          </ButtonLink>
        </div>
      </main>
    </>
  );
}
