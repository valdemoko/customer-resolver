/**
 * Airport resolution for Reglamento 261/2004 distances.
 *
 * The flight questionnaire accepts what a passenger knows ("Madrid", "Londres"),
 * but the compensation tier comes from the great-circle distance, which needs
 * coordinates. A raw IATA lookup silently failed for city answers: no distance,
 * no tier, and the user was asked for a fact they could not answer.
 *
 * These tests pin the resolution that fixes it, and the honesty of the failure
 * mode: an unrecognised answer resolves to null instead of a guessed airport.
 */
import { describe, expect, it } from "vitest";

import { airportOptions, normalizeAirportInput, resolveAirport } from "@core/problems/airports";

describe("resolveAirport", () => {
  it("resolves an exact IATA code", () => {
    expect(resolveAirport("MAD")?.code).toBe("MAD");
    expect(resolveAirport("mad")?.code).toBe("MAD");
    expect(resolveAirport(" LHR ")?.code).toBe("LHR");
  });

  it("resolves a city name, which is what people actually answer", () => {
    expect(resolveAirport("Madrid")?.code).toBe("MAD");
    expect(resolveAirport("Barcelona")?.code).toBe("BCN");
    expect(resolveAirport("Londres")?.code).toBe("LHR");
    expect(resolveAirport("Paris")?.code).toBe("CDG");
  });

  it("ignores accents, case and punctuation", () => {
    expect(resolveAirport("málaga")?.code).toBe("AGP");
    expect(resolveAirport("A CORUÑA")?.code).toBe("LCG");
    expect(resolveAirport("Santiago de Compostela")?.code).toBe("SCQ");
    expect(resolveAirport("MAD-Barajas, T4")?.code).toBe("MAD");
  });

  it("resolves the airport's own name", () => {
    expect(resolveAirport("Barajas")?.code).toBe("MAD");
    expect(resolveAirport("El Prat")?.code).toBe("BCN");
    expect(resolveAirport("Heathrow")?.code).toBe("LHR");
  });

  it("returns null for an answer it cannot recognise (never guesses)", () => {
    expect(resolveAirport("")).toBeNull();
    expect(resolveAirport("   ")).toBeNull();
    expect(resolveAirport("no lo sé")).toBeNull();
    expect(resolveAirport("Villa Arriba del Monte")).toBeNull();
  });

  it("produces coordinates usable for a distance", () => {
    const madrid = resolveAirport("Madrid");
    const london = resolveAirport("Londres");
    expect(madrid).not.toBeNull();
    expect(london).not.toBeNull();
    // Madrid–London is roughly 1.200 km: same tier (250 €), so a small error in
    // the reference points cannot flip the tier.
    expect(madrid!.lat).toBeCloseTo(40.5, 0);
    expect(london!.lon).toBeCloseTo(-0.45, 0);
  });

  it("offers suggestions that are themselves resolvable", () => {
    const options = airportOptions();
    expect(options.length).toBeGreaterThan(20);
    for (const option of options.slice(0, 25)) {
      expect(resolveAirport(option)).not.toBeNull();
    }
  });
});

describe("normalizeAirportInput", () => {
  it("keeps only letters, digits and single spaces, uppercased", () => {
    expect(normalizeAirportInput("  madrid—barajas  ")).toBe("MADRID BARAJAS");
    expect(normalizeAirportInput("A Coruña")).toBe("A CORUNA");
  });
});
