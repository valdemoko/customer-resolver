import { z } from "zod";

/**
 * Mercado de unidades publicitarias (Fase C).
 *
 * UNA UNIDAD es lo que se compra. Tipos:
 *   · `b:` edificio completo (`b:way/123`)
 *   · `p:` local de planta baja (`p:L-xxxxxxx`)
 *   · `w:` tramo de muralla de la Alcazaba o Gibralfaro (`w:gibralfaro:07`)
 *   · `s:` panel publicitario del casco de un crucero (`s:cruise-1:3`)
 *   · `v:` vela de una embarcación pequeña (`v:12`)
 *   · `a:` cartel remolcado por una avioneta (`a:plane-1`)
 *
 * El identificador es lo único que viaja entre el visor, la API y la base de
 * datos. El precio sale SIEMPRE del servidor.
 */

export const UNIT_ID_PATTERN =
  /^(b:(way|relation)\/\d{1,12}|p:L-[0-9a-z]{7}|w:(alcazaba|gibralfaro):\d{1,3}|s:cruise-[1-3]:[0-7]|v:\d{1,3}|a:plane-[1-3])$/;

export type UnitKind = "building" | "parcel" | "wall" | "ship" | "sail" | "plane";

export function unitKindOf(id: string): UnitKind {
  switch (id[0]) {
    case "b":
      return "building";
    case "p":
      return "parcel";
    case "w":
      return "wall";
    case "s":
      return "ship";
    case "v":
      return "sail";
    default:
      return "plane";
  }
}

export const UNIT_KIND_LABEL: Record<UnitKind, string> = {
  building: "Edificio",
  parcel: "Local",
  wall: "Tramo de muralla",
  ship: "Panel de crucero",
  sail: "Vela",
  plane: "Cartel de avioneta",
};

/** Precio inicial de toda unidad: 1 €. */
export const BASE_PRICE_CENTS = 100;

/** Máximos de contenido. Las imágenes se reducen en el navegador antes de enviarse. */
export const LIMITS = {
  name: 60,
  description: 600,
  url: 300,
  facesPerUnit: 16,
  imageBytes: 160_000,
  totalImageBytes: 1_400_000,
} as const;

const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Encuadre de la foto del anuncio: qué parte se ve. `x` e `y` (0–1) desplazan la
 * ventana por la foto (0 = izquierda/arriba, 1 = derecha/abajo, 0,5 = centrada) y
 * `zoom` (1–3) la amplía. Es el mismo para fachada, techo y paneles.
 */
export const FramingSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  zoom: z.number().min(1).max(3),
});
export type Framing = z.infer<typeof FramingSchema>;
export const DEFAULT_FRAMING: Framing = { x: 0.5, y: 0.5, zoom: 1 };

export const ContentSchema = z.object({
  /** Nombre del anunciante (obligatorio). */
  name: z.string().trim().min(2).max(LIMITS.name),
  /** Página web. Solo http(s). */
  url: z
    .string()
    .trim()
    .max(LIMITS.url)
    .refine((value) => value === "" || /^https?:\/\/[^\s]+$/i.test(value), "La URL debe empezar por http:// o https://")
    .default(""),
  description: z.string().trim().max(LIMITS.description).default(""),
  /** Foto o logotipo de la empresa (data URL ya reducida). */
  logo: z
    .string()
    .max(LIMITS.imageBytes * 1.4)
    .refine((value) => value === "" || DATA_URL.test(value), "Imagen no válida")
    .default(""),
  /** Si `true`, `images.all` se pinta en todas las caras (el estudio lo envía siempre así). */
  sameForAll: z.boolean().default(false),
  /** Encuadre de la foto (por defecto, centrada y sin ampliar). */
  framing: FramingSchema.default(DEFAULT_FRAMING),
  /** Imágenes: `all` (fachada, se repite en todas las caras), `roof` (techo) o, en datos antiguos, `f0`, `f1`… por cara. */
  images: z
    .record(
      z.string().regex(/^(all|roof|f\d{1,2})$/),
      z.string().max(LIMITS.imageBytes * 1.4).refine((value) => DATA_URL.test(value), "Imagen no válida"),
    )
    .default({}),
});

export type Content = z.infer<typeof ContentSchema>;

/** Vista pública de una unidad comprada (sin imágenes). */
export type UnitView = {
  id: string;
  purchases: number;
  /** Precio de la PRÓXIMA compra, en céntimos. */
  priceCents: number;
  owned: boolean;
  /** Hasta cuándo nadie puede comprar este espacio (2 h tras la última compra), o `null`. */
  lockedUntil: string | null;
  owner: null | {
    name: string;
    url: string;
    description: string;
    hasLogo: boolean;
    faces: string[];
    sameForAll: boolean;
    framing: Framing;
    since: string;
  };
};

export type MarketState = {
  units: UnitView[];
  /** Marca de versión: cambia con cada compra, sirve para refrescar texturas. */
  version: string;
  purchasesEnabled: boolean;
};
