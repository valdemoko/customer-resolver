/**
 * Official escalation channels ("Dónde reclamar") shown in every report.
 *
 * A consumer report that names a body must name a real one: these tests pin the
 * official domains and forbid contact details that could be wrong (emails,
 * phone numbers), which would send a user to a channel that does not exist.
 */
import { describe, expect, it } from "vitest";

import { channelsForProblem } from "@core/result/channels";

describe("channelsForProblem", () => {
  it("always returns the general official channels", () => {
    for (const problemKey of ["unknown", "", null, undefined, "warranty-rejection"]) {
      const channels = channelsForProblem(problemKey);
      expect(channels.length).toBeGreaterThan(0);
      const ids = channels.map((c) => c.id);
      expect(ids).toContain("ministerio-reclamar-conflicto");
      expect(ids).toContain("omic-junta-arbitral");
      expect(ids).toContain("sede-consumo");
      expect(ids).toContain("centro-europeo-consumidor");
    }
  });

  it("adds the competent authority for the problem module", () => {
    expect(channelsForProblem("flight-cancel").map((c) => c.id)).toContain("aesa-pasajeros");
    expect(channelsForProblem("cancellation-charge").map((c) => c.id)).toContain(
      "oficina-atencion-usuario",
    );
    expect(channelsForProblem("warranty-rejection").map((c) => c.id)).not.toContain(
      "aesa-pasajeros",
    );
  });

  it("links only official .gob.es pages", () => {
    const all = [
      ...channelsForProblem("flight-cancel"),
      ...channelsForProblem("cancellation-charge"),
      ...channelsForProblem("warranty-rejection"),
    ];

    for (const channel of all) {
      const url = new URL(channel.url);
      expect(url.protocol).toBe("https:");
      expect(url.hostname.endsWith("gob.es"), `${channel.id}: ${url.hostname}`).toBe(true);
    }
  });

  it("never invents contact details: no emails or phone numbers in the text", () => {
    const all = channelsForProblem("flight-cancel");

    for (const channel of all) {
      const text = `${channel.target} ${channel.channel} ${channel.why}`;
      expect(text).not.toContain("@");
      // Phone-like sequences ("91 234 56 78", "+34 912345678").
      expect(/\+?\d[\d ]{6,}\d/.test(text), `${channel.id}: ${text}`).toBe(false);
    }

    // Every entry must be fully described.
    for (const channel of all) {
      expect(channel.target.length).toBeGreaterThan(3);
      expect(channel.channel.length).toBeGreaterThan(3);
      expect(channel.why.length).toBeGreaterThan(10);
    }
  });
});
