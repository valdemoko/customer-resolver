import { warn } from "./log.mjs";

/**
 * User-Agent identificativo. Overpass y el Catastro rechazan (o limitan) las
 * peticiones que no identifican a quien las hace. Es una obligación, no una
 * cortesía.
 */
export const USER_AGENT =
  "Alzado/0.1 (cartografia urbana; +https://example.invalid/alzado)";

const RETRIES = 4;
const BASE_DELAY_MS = 800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Petición con reintentos y espera creciente. Reintenta solo lo que tiene
 * sentido reintentar: 429, 5xx y fallos de red. Un 400 o un 404 es un error de
 * programación y debe fallar de inmediato.
 */
export async function fetchText(
  url,
  {
    method = "GET",
    body,
    headers = {},
    timeoutMs = 180_000,
    retries = RETRIES,
    /**
     * Devuelve también el cuerpo de las respuestas 5xx en lugar de reintentar.
     * Hace falta con el WFS del Catastro, que responde a las peticiones
     * demasiado grandes con una página de error: ahí lo útil no es reintentar
     * (tardaría 12 minutos por celda y seguiría fallando) sino ver el cuerpo y
     * subdividir la petición.
     */
    returnServerErrors = false,
  } = {},
) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        body,
        headers: { "User-Agent": USER_AGENT, ...headers },
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await response.text();

      if (response.ok) {
        return { status: response.status, text, headers: response.headers };
      }

      if (returnServerErrors && response.status >= 500) {
        return { status: response.status, text, headers: response.headers };
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) {
        throw new Error(
          `HTTP ${response.status} en ${url}\n${text.slice(0, 500)}`,
        );
      }
      lastError = new Error(`HTTP ${response.status} en ${url}`);
    } catch (error) {
      clearTimeout(timer);
      // Un error no reintentable (por ejemplo un 404 explícito) se propaga ya.
      if (error instanceof Error && error.message.startsWith("HTTP ") && !/HTTP (429|5\d\d)/.test(error.message)) {
        throw error;
      }
      lastError = error;
    }

    if (attempt < retries) {
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      warn(`Intento ${attempt} fallido (${lastError?.message?.slice(0, 90)}). Reintento en ${delay} ms.`);
      await sleep(delay);
    }
  }

  throw new Error(`Se agotaron los reintentos en ${url}: ${lastError?.message}`);
}

export async function fetchJson(url, options) {
  const { text } = await fetchText(url, options);
  return JSON.parse(text);
}

/** Formatea una fecha como YYYY-MM-DD en UTC (la que va al manifiesto). */
export function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
