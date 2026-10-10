const WHEN = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

/** «el 15 de octubre a las 18:42» (hora de Madrid) a partir de una fecha ISO. */
export function formatLockEnd(iso: string): string {
  const parts = WHEN.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `el ${get("day")} de ${get("month")} a las ${get("hour")}:${get("minute")}`;
}

/** Si el espacio sigue protegido, hasta cuándo (texto legible, hora de Madrid); si no, `null`. */
export function lockHour(lockedUntil: string | null | undefined, now = Date.now()): string | null {
  if (!lockedUntil) return null;
  const until = Date.parse(lockedUntil);
  if (!Number.isFinite(until) || until <= now) return null;
  return formatLockEnd(lockedUntil);
}
