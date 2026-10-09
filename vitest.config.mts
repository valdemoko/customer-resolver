import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest no lee `next.config.ts`, así que el alias `@/*` hay que declararlo
 * aquí. Sin esto, los tests que importan módulos de la aplicación fallan al
 * resolver rutas y —peor— los tests de esos módulos simplemente no se ejecutan.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
