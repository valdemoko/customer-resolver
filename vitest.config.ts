import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "src/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/core/**", "src/server/**", "src/docintel/**", "src/ai/**", "src/problems/**"],
    },
  },
});
