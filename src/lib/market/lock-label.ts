/** Si el espacio sigue protegido, la hora (Madrid) hasta la que lo está; si no, `null`. */
export function lockHour(lockedUntil: string | null | undefined, now = Date.now()): string | null {
  if (!lockedUntil) return null;
  const until = Date.parse(lockedUntil);
  if (!Number.isFinite(until) || until <= now) return null;
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(until));
}
