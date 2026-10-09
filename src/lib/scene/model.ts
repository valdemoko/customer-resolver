/**
 * Textos que la interfaz tiene que decir en voz alta.
 *
 * Están aquí y no dentro del componente porque son afirmaciones sobre los datos,
 * no detalles de presentación: si alguien cambia la regla de las alturas, tiene
 * que cambiar también el texto que las explica, y en un solo sitio.
 */

/** Altura por planta usada por el pipeline (3 m). */
export const BUILDING_HEIGHT_UNIT_M = 3;

/**
 * Cómo se llama, en la interfaz, una unidad publicitaria que aún no está en
 * catálogo. No se llama «disponible» ni «premium»: esos estados no existen
 * todavía y ponerlos sería inventar el catálogo.
 */
export const UNIT_STATE_LABEL = "Candidata (sin catálogo)";

export const UNIT_STATE_DETAIL =
  "Los estados disponible, ocupada y premium llegarán con el catálogo de parcelas (fase D). Hoy no hay ninguno registrado, así que no se muestra ninguno: un estado inventado sería peor que un estado ausente.";

/** Aviso de terreno plano, para la ficha de ciudad y /atribuciones (no para el mapa). */
export const TERRAIN_NOTE =
  "Terreno plano: no se usa la elevación real porque su licencia no está verificada. En Málaga eso significa que Gibralfaro y la Alcazaba no aparecen elevados.";
