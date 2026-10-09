import { cn } from "@/lib/cn";

/**
 * Estado vacío. Diseñado, no un texto suelto: icono de línea, título, una
 * explicación honesta de por qué está vacío y, si procede, una acción.
 * Nunca rellena el hueco con contenido inventado.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mb-3 text-subtle" aria-hidden="true">
        {icon}
      </div>
      <h2 className="text-lg font-medium text-ink">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
