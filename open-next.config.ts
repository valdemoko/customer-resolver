import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Configuración del adaptador de Next.js para Cloudflare Workers.
 * Sin caché incremental en R2: las páginas dinámicas leen de Neon y las estáticas
 * se sirven como activos. Si algún día se usa ISR, habrá que añadir aquí la caché.
 */
export default defineCloudflareConfig();
