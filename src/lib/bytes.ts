/**
 * Formato de tamaños en bytes, en español.
 *
 * POR QUÉ EXISTE: la ficha de ciudad imprimía el peso del paquete como
 * «1.57 MB» —`.toFixed(2)` siempre usa el punto decimal, sea cual sea el
 * idioma— dentro de una interfaz en español donde el resto de cifras se
 * escriben con coma («3.836 edificios», «94,5 %»). Una cifra con el separador
 * equivocado no es un detalle de estilo: se lee como si fuera otro número. Aquí
 * el redondeo y el separador se deciden en un único sitio.
 *
 * Las unidades son las del Sistema Internacional tal y como las usa el
 * navegador (1024), no las decimales de los fabricantes de discos: lo que se
 * muestra es comparable con lo que informa la pestaña de red.
 */

const KIB = 1024;
const MIB = 1024 * 1024;

const DECIMAL = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INTEGER = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

/**
 * Tamaño legible. Devuelve `null` mientras no se ha medido nada (0 o valor no
 * finito), para que quien lo llame pueda decidir no mostrar nada en lugar de
 * enseñar «0 B», que se leería como «no se descarga nada».
 */
export function formatBytes(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < KIB) return `${INTEGER.format(bytes)} B`;
  if (bytes < MIB) return `${INTEGER.format(bytes / KIB)} kB`;
  return `${DECIMAL.format(bytes / MIB)} MB`;
}
