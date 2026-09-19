/**
 * Phase 0 placeholder homepage.
 * Deliberately minimal: semantic HTML, heading hierarchy, keyboard focus visible.
 * Final product UX/design arrives in later phases (ARCHITECTURE.md §25).
 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Consumer Resolver</h1>
        <p className="mt-4 text-neutral-700">
          Este proyecto está en construcción. La Fase 0 prepara la base técnica: compilación
          estricta, boundaries arquitectónicas, tests y CI.
        </p>
      </header>
      <section aria-labelledby="status-heading" className="mt-10">
        <h2 id="status-heading" className="text-xl font-semibold">
          Estado del proyecto
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-6 text-neutral-700">
          <li>Scaffold de producción configurado</li>
          <li>CI con lint, typecheck, tests y build</li>
          <li>Motores de dominio: pendientes (Fase 1+)</li>
        </ul>
      </section>
    </main>
  );
}
