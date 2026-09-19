import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architectural boundary scan (Phase 0).
 *
 * Complements eslint-plugin-boundaries with a filesystem-level check so that
 * forbidden dependency directions fail even outside the editor/ESLint runtime
 * (e.g. if ESLint config is bypassed). Direction rules: docs/ARCHITECTURE.md §4.
 */

// tests/unit/boundaries → project src/
const SRC = resolve(process.cwd(), "src");

/** Layer directory (relative to src/) → forbidden import patterns. */
const RULES: Array<{ layer: RegExp; forbidden: RegExp; reason: string }> = [
  {
    layer: /(?:^|[\\/])core(?:$|[\\/])/,
    forbidden:
      /from\s+["'](next|react|react-dom|@server\/|@app\/|@problems\/|drizzle-orm|postgres|pg|groq-sdk|openai|@aws-sdk|tailwindcss)["'/]/,
    reason: "core must not import framework, server infra, problems or providers",
  },
  {
    layer: /(?:^|[\\/])problems(?:$|[\\/])/,
    forbidden:
      /from\s+["'](@server\/|@app\/|drizzle-orm|postgres|pg|groq-sdk|openai|@aws-sdk)["'/]/,
    reason: "problems must not import server infrastructure or AI/DB providers directly",
  },
  {
    layer: /(?:^|[\\/])(?:docintel|ai|sources)(?:$|[\\/])/,
    forbidden: /from\s+["'](react|react-dom|next\/|@server\/|@app\/|@problems\/)["'/]/,
    reason: "domain services must not import UI or application layer",
  },
];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("architectural boundaries (filesystem scan)", () => {
  it("no layer imports a forbidden dependency direction", () => {
    const violations: string[] = [];

    for (const rule of RULES) {
      const files = listFiles(SRC).filter((file) => rule.layer.test(file));
      for (const file of files) {
        const content = readFileSync(file, "utf8");
        if (rule.forbidden.test(content)) {
          violations.push(`${file}: ${rule.reason}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
