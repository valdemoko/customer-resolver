/**
 * Problem page content tests.
 *
 * The audit of 2026-09-22 found the four problem pages were ~350-word landing
 * pages with no worked example, no steps and no questions answered. These tests
 * keep the added material complete, honest (no unsupported deadlines, no raw
 * fact keys leaking into public copy) and internally consistent.
 */
import { describe, expect, it } from "vitest";

import { PROBLEM_CATALOGUE, getProblemBySlug } from "@/lib/problem-catalogue";

const rawFactKeyPattern = /\b(flight|cancellation|charge|service|passenger|airline)\.[a-z_]+/;

describe("problem page content", () => {
  it("gives every page a review date", () => {
    for (const entry of PROBLEM_CATALOGUE) {
      expect(entry.updatedAt, entry.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("gives every page a worked example with sourced outcomes", () => {
    for (const entry of PROBLEM_CATALOGUE) {
      expect(entry.example.scenario.length, entry.key).toBeGreaterThan(80);
      expect(entry.example.outcome.length, entry.key).toBeGreaterThanOrEqual(3);
      for (const line of entry.example.outcome) {
        expect(line.length, entry.key).toBeGreaterThan(40);
      }
    }
  });

  it("gives every page step-by-step claiming instructions", () => {
    for (const entry of PROBLEM_CATALOGUE) {
      expect(entry.steps.length, entry.key).toBeGreaterThanOrEqual(4);
      for (const step of entry.steps) {
        expect(step.length, entry.key).toBeGreaterThan(40);
      }
    }
  });

  it("answers the questions the questionnaire raises", () => {
    for (const entry of PROBLEM_CATALOGUE) {
      expect(entry.faq.length, entry.key).toBeGreaterThanOrEqual(4);
      for (const item of entry.faq) {
        expect(item.question.endsWith("?"), item.question).toBe(true);
        expect(item.answer.length, item.question).toBeGreaterThan(80);
      }
    }
  });

  it("links only to problems that exist, and never to itself", () => {
    for (const entry of PROBLEM_CATALOGUE) {
      expect(entry.relatedSlugs.length, entry.key).toBeGreaterThan(0);
      for (const slug of entry.relatedSlugs) {
        expect(getProblemBySlug(slug), `${entry.key} → ${slug}`).toBeDefined();
        expect(slug).not.toBe(entry.slug);
      }
    }
  });

  it("never shows a raw fact key in public copy", () => {
    for (const entry of PROBLEM_CATALOGUE) {
      const copy = [
        ...entry.steps,
        entry.example.scenario,
        ...entry.example.outcome,
        ...entry.faq.flatMap((f) => [f.question, f.answer]),
        ...entry.saberMas.keyFacts,
        ...entry.saberMas.importantDates,
        ...entry.saberMas.commonMistakes,
        ...entry.saberMas.whatWeVerify,
        ...entry.saberMas.whatCannotBeDetermined,
      ].join(" ");
      expect(rawFactKeyPattern.test(copy), `${entry.key} leaks a fact key`).toBe(false);
    }
  });

  it("does not claim deadlines the sources do not support", () => {
    for (const entry of PROBLEM_CATALOGUE) {
      const copy = [
        ...entry.saberMas.importantDates,
        ...entry.saberMas.commonMistakes,
        ...entry.faq.map((f) => f.answer),
      ].join(" ");
      // "3 meses" was never backed by any registered source; the TRLGDCU
      // periods are 3 years (art. 120.1) and 2 years (art. 121.1).
      expect(copy).not.toContain("3 meses");
      expect(copy).not.toContain("tres meses para reclamar");
      expect(copy).not.toContain("2 años para reclamar");
    }
  });

  it("quotes the article that actually supports each flight claim", () => {
    const flight = getProblemBySlug("vuelo-cancelado")!;
    const copy = flight.faq.map((f) => f.answer).join(" ");
    expect(copy).toContain("art. 7.1");
    expect(copy).toContain("art. 5.1.c");
    expect(copy).toContain("art. 7.2");
  });

  it("states the TRLGDCU warranty periods as published", () => {
    const warranty = getProblemBySlug("garantia-rechazada")!;
    const copy = [
      warranty.faq.map((f) => f.answer).join(" "),
      warranty.example.outcome.join(" "),
    ].join(" ");
    expect(copy).toContain("tres años");
    expect(copy).toContain("art. 120.1");
    expect(copy).toContain("art. 121.1");
  });

  it("mentions the double refund the TRLGDCU allows for unjustified delay", () => {
    const delivery = getProblemBySlug("pedido-no-llega")!;
    const copy = [
      delivery.faq.map((f) => f.answer).join(" "),
      delivery.example.outcome.join(" "),
      delivery.steps.join(" "),
    ].join(" ");
    expect(copy).toContain("doble del importe adeudado");
    expect(copy).toContain("art. 110");
  });
});
