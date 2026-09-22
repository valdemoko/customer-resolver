/**
 * Corrections log tests.
 *
 * `/correcciones` is a public accountability page: it must never become a fake
 * changelog. These tests pin the rules that make it honest — dated entries, a
 * stated limitation when the log is empty, and copy that names what was wrong
 * instead of vague "improvements".
 */
import { describe, expect, it } from "vitest";

import {
  CORRECTIONS,
  CORRECTIONS_LOG_START,
  CORRECTION_KIND_LABELS,
  hasCorrections,
} from "@/lib/corrections";

describe("corrections log", () => {
  it("starts on a real date", () => {
    expect(CORRECTIONS_LOG_START).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("dates every entry and keeps them within the log's window", () => {
    for (const entry of CORRECTIONS) {
      expect(entry.date, entry.problem.slice(0, 40)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.date >= CORRECTIONS_LOG_START, entry.date).toBe(true);
      // Not in the future: an entry describes something already applied.
      expect(new Date(`${entry.date}T00:00:00Z`).getTime()).toBeLessThanOrEqual(
        Date.now() + 24 * 60 * 60 * 1000,
      );
    }
  });

  it("states what was wrong and what it says now, with enough detail to verify", () => {
    for (const entry of CORRECTIONS) {
      expect(entry.problem.length, entry.date).toBeGreaterThan(60);
      expect(entry.resolution.length, entry.date).toBeGreaterThan(60);
      expect(entry.scope.length, entry.date).toBeGreaterThan(5);
    }
  });

  it("never uses a vague label instead of describing the change", () => {
    const vague = /^(mejoras?|ajustes?|varios|cambios varios)[.\s]*$/i;
    for (const entry of CORRECTIONS) {
      expect(vague.test(entry.problem.trim()), entry.problem).toBe(false);
      expect(vague.test(entry.resolution.trim()), entry.resolution).toBe(false);
    }
  });

  it("uses only known categories, and only categories the page can name", () => {
    for (const entry of CORRECTIONS) {
      expect(CORRECTION_KIND_LABELS[entry.kind], entry.kind).toBeDefined();
    }
  });

  it("reports whether there is anything to show", () => {
    expect(hasCorrections()).toBe(CORRECTIONS.length > 0);
  });

  it("exposes a page that is indexable and canonical", async () => {
    const { metadata } = await import("@/app/correcciones/page");
    expect(metadata.title).toContain("Correcciones");
    expect(metadata.alternates?.canonical).toBe("/correcciones");
    // It is public content with an accountability purpose: it must be indexable.
    expect(metadata.robots).toBeUndefined();
  });
});
