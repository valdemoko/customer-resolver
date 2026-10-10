"use client";

import { CountUp } from "./CountUp";
import { useLeaderboards } from "./useLeaderboards";

/**
 * Cifras que salen de la base de datos (compras y anunciantes). Si no hay
 * lectura fiable no se enseña ninguna: ni ceros ni guiones que parezcan un dato.
 */
export function LiveStats() {
  const state = useLeaderboards();
  if (state.status !== "ready" || !state.data.available || !state.data.stats) return null;
  const { purchases } = state.data.stats;
  return (
    <>
      <Metric label="Compras completadas" node={<CountUp value={purchases} />} />
    </>
  );
}

export function Metric({ label, node }: { label: string; node: React.ReactNode }) {
  return (
    <div className="px-5 py-5 sm:px-6">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="display-face mt-1.5 text-[1.9rem] font-medium tracking-[-0.03em] text-ink sm:text-4xl">{node}</dd>
    </div>
  );
}

/** Cifras de la ciudad (hero de la página de Málaga): solo las que la base de datos confirma. */
export function CityNumbers() {
  const state = useLeaderboards();
  if (state.status === "loading") {
    return <p className="text-sm text-subtle" aria-busy="true">Cargando cifras de la red…</p>;
  }
  if (state.status === "error" || !state.data.available || !state.data.stats) {
    return <p className="text-sm text-subtle">Las cifras de actividad no están disponibles ahora mismo.</p>;
  }
  const { purchases, unitsOwned, owners } = state.data.stats;
  return (
    <dl className="flex flex-wrap divide-x divide-y divide-line border border-line bg-surface/70 [&>*]:min-w-[50%] [&>*]:flex-1 sm:[&>*]:min-w-[25%]">
      <Metric label="Espacios con anunciante" node={<CountUp value={unitsOwned} />} />
      <Metric label="Compras completadas" node={<CountUp value={purchases} />} />
      <Metric label="Anunciantes" node={<CountUp value={owners} />} />
    </dl>
  );
}
