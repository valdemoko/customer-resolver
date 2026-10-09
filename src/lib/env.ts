/**
 * Interruptor maestro de compras.
 *
 * Regla de producto: NO existe un modo "simulado" que aparente una compra real.
 * Con el interruptor en false, la API rechaza crear pedidos y la interfaz
 * muestra "Compras próximamente". Nada más.
 */
export const purchasesEnabled: boolean = process.env.PURCHASES_ENABLED === "true";

/** Etiqueta que la interfaz debe mostrar cuando las compras están apagadas. */
export const PURCHASES_DISABLED_LABEL = "Compras próximamente";

/**
 * Origen público de la aplicación. Nunca se deriva de la cabecera Host de la
 * petición: se lee de entorno para evitar envenenamiento de host en callbacks
 * de autenticación, canonical y webhooks.
 *
 * Si no está definido se usa un valor por defecto explícito para que el build
 * y el desarrollo local funcionen sin configuración. Las rutas que NO pueden
 * tolerar un origen equivocado (callbacks de autenticación, redirecciones de
 * pago, webhooks) deben llamar a `requireAppOrigin()` en su lugar.
 */
export function appOrigin(): string {
  const raw = process.env.APP_ORIGIN?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/**
 * Igual que `appOrigin()`, pero falla si no hay configuración explícita en
 * producción. Se usa en los puntos donde un origen equivocado es un fallo de
 * seguridad, no un detalle estético.
 */
export function requireAppOrigin(): string {
  const configured = process.env.APP_ORIGIN?.trim();
  if (!configured && process.env.NODE_ENV === "production" && !process.env.VERCEL_URL) {
    throw new Error(
      "APP_ORIGIN es obligatorio en producción. Configúralo con el origen público exacto (por ejemplo https://resolveo.site), sin barra final.",
    );
  }
  return appOrigin();
}
