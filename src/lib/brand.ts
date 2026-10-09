/**
 * Marca. Un único lugar donde vive la identidad textual: cambiar de nombre
 * no debe requerir tocar componentes.
 *
 * Decisión y comprobación de colisiones: /docs/decisions.md#marca
 */
export const brand = {
  /** Nombre corto, el que aparece en el wordmark y en <title>. */
  name: "Resolveo",
  /**
   * Marca: Resolveo (dominio resolveo.site). Identidad: un globo troceado
   * —la misma trama del mapa de la portada— en blanco, que hace de
   * baliza de ciudad. Las claves técnicas internas (`alzado.catalog.v1`,
   * `__alzadoIsland`) conservan el nombre antiguo a propósito: renombrarlas
   * borraría las ciudades guardadas de quien ya usa el sitio.
   */
  tagline: "Publicidad en ciudades reales, en tres dimensiones",
  /** Descripción corta para metadatos. */
  description:
    "Explora ciudades reales en 3D y elige la fachada donde anunciarte. Cartografía de precisión, licencias documentadas y precios claros.",
  /** Variante compacta para la barra superior y el favicon. */
  markLetters: "RV",
} as const;

export type Brand = typeof brand;

/** La primera ciudad abierta de la red. Se presenta con una marca propia («ciudad inaugural») en el catálogo. */
export const INAUGURAL_CITY = "malaga";
