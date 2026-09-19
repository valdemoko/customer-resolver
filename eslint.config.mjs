import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import typescriptEslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

/**
 * Architectural boundaries (docs/ARCHITECTURE.md §4):
 *
 *   app → server → domain (docintel/ai/sources) → core ← problems
 *
 *  - core: pure domain. Never imports react/next/server/db/providers/UI.
 *  - problems: may import core + shared domain services. Never server/db/providers directly.
 *  - server: infrastructure (db, storage, auth, security). May import core.
 *  - app: composition layer (RSC, route handlers). May import everything.
 *
 * Enforced by eslint-plugin-boundaries + forbidden import sources below.
 */
export default defineConfig([
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  typescriptEslint.configs.recommended,
  {
    settings: {
      "boundaries/resolver": "typescript",
      "boundaries/include-test-files": true,
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "server", pattern: ["src/server/**"] },
        { type: "domain", pattern: ["src/docintel/**", "src/ai/**", "src/sources/**"] },
        { type: "problems", pattern: "src/problems/**" },
        { type: "core", pattern: "src/core/**" },
        { type: "ui", pattern: "src/components/**" },
        { type: "lib", pattern: "src/lib/**" },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    rules: {
      // Direction: app → {server, domain, problems, core, ui, lib}
      //            server → {domain, core, lib}
      //            domain → {core, lib}
      //            problems → {core, domain, lib}
      //            core → {lib (core-internal shared) only}
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "app", allow: ["server", "domain", "problems", "core", "ui", "lib"] },
            { from: "server", allow: ["domain", "core", "lib"] },
            { from: "domain", allow: ["core", "lib"] },
            { from: "problems", allow: ["core", "domain", "lib"] },
            { from: "core", allow: ["lib"] },
            { from: "ui", allow: ["core", "lib"] },
            { from: "lib", allow: ["core"] },
          ],
        },
      ],
      "boundaries/entry-point": ["error", { default: "allow", rules: [] }],
    },
  },
  {
    // Never import framework from domain layers (app/ legitimately uses Next/React).
    files: [
      "src/core/**",
      "src/server/**",
      "src/lib/**",
      "src/docintel/**",
      "src/ai/**",
      "src/sources/**",
      "src/problems/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react-dom", "react-dom/*"],
              message:
                "domain layers must not import framework. Move framework usage to app/ or components/.",
            },
          ],
        },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > TSAnyKeyword",
          message: "Avoid `as any`. Model the type correctly instead.",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The boundary enforcer itself may reference framework types in tests.
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);
