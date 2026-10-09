import type { Content, MarketState, UnitView } from "./types";
import { LIMITS } from "./types";

/** Llamadas del navegador a la API del mercado. Nada de precios aquí: los pone el servidor. */

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Error ${response.status}`);
  return body;
}

export async function fetchMarketState(signal?: AbortSignal): Promise<MarketState> {
  return json<MarketState>(await fetch("/api/market/state", { cache: "no-store", ...(signal ? { signal } : {}) }));
}

export async function fetchUnit(unitId: string): Promise<UnitView> {
  return json<UnitView>(await fetch(`/api/market/unit?id=${encodeURIComponent(unitId)}`, { cache: "no-store" }));
}

export async function startCheckout(input: {
  unitId: string;
  unitLabel: string;
  content: Content;
  returnPath: string;
}): Promise<{ url: string; amountCents: number }> {
  return json(
    await fetch("/api/market/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function confirmCheckout(sessionId: string): Promise<{ applied: boolean; unit: UnitView }> {
  return json(await fetch(`/api/market/confirm?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" }));
}

/** Tamaños de destino por tipo de imagen: lado mayor en píxeles y peso objetivo en bytes. */
export const IMAGE_PRESETS = {
  facade: { maxSide: 1024, targetBytes: 70_000 },
  roof: { maxSide: 1024, targetBytes: 70_000 },
  logo: { maxSide: 384, targetBytes: 24_000 },
} as const;
export type ImagePreset = keyof typeof IMAGE_PRESETS;

const dataUrlBytes = (dataUrl: string) => Math.round(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
export { dataUrlBytes };

/**
 * Comprime una imagen elegida por el comprador en el navegador, ANTES de subirla:
 * WebP (o JPEG si el navegador no lo escribe), a un lado máximo de 1024 px (384 en
 * el logo), bajando calidad y tamaño por pasos hasta quedar por debajo del peso
 * objetivo (≈ 70 kB). Una foto de móvil de 4 MB acaba pesando unas decenas de kB:
 * así la base de datos y las páginas de los visitantes no se llenan de peso.
 */
export async function downscaleImage(file: File, preset: ImagePreset = "facade"): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) throw new Error("Elige una imagen JPG, PNG o WebP.");
  if (file.size > 20_000_000) throw new Error("La imagen pesa más de 20 MB.");
  const { maxSide, targetBytes } = IMAGE_PRESETS[preset];
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  let side: number = maxSide;
  let best = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Este navegador no puede procesar imágenes.");
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58, 0.46, 0.36]) {
      let dataUrl = canvas.toDataURL("image/webp", quality);
      if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/jpeg", quality);
      best = dataUrl;
      if (dataUrlBytes(dataUrl) <= targetBytes) {
        bitmap.close();
        return dataUrl;
      }
    }
    side = Math.round(side * 0.8);
  }
  bitmap.close();
  if (dataUrlBytes(best) <= LIMITS.imageBytes) return best; // por encima del objetivo, pero admisible
  throw new Error("No se ha podido reducir la imagen lo bastante.");
}
