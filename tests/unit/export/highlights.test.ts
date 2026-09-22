/**
 * Key figures: the amounts and dates the claim turns on, at the top of the
 * report. Only named facts, only confirmed ones, amounts before dates.
 */
import { describe, expect, it } from "vitest";

import { buildCaseHighlights } from "@core/export/highlights";

const LABELS = {
  questions: {
    "charge.amount": "¿De cuánto es el importe cobrado?",
    "charge.date": "¿En qué fecha te han cobrado el cargo?",
    "cancellation.date": "¿En qué fecha solicitaste la cancelación?",
    "contract.commitment_exists": "¿Tu contrato incluía compromiso de permanencia?",
  },
  factLabels: {
    "charge.amount": "Importe del cargo cuestionado",
  },
};

const FACTS = [
  {
    key: "charge.date",
    value: { type: "date", value: "2026-07-01" },
    status: "CONFIRMED",
  },
  {
    key: "charge.amount",
    value: { type: "money", value: { amountMinor: 5990, currency: "EUR" } },
    status: "CONFIRMED",
  },
  {
    key: "cancellation.date",
    value: { type: "date", value: "2026-06-10" },
    status: "CONFIRMED",
  },
  {
    key: "contract.commitment_exists",
    value: { type: "boolean", value: false },
    status: "CONFIRMED",
  },
];

describe("buildCaseHighlights", () => {
  it("lists the amounts first, then the dates, with readable values", () => {
    const highlights = buildCaseHighlights(FACTS, LABELS);

    expect(highlights.map((h) => h.kind)).toEqual(["money", "date", "date"]);
    // The question the person was asked names the fact, not the catalogue.
    expect(highlights[0]).toEqual({
      label: "¿De cuánto es el importe cobrado?",
      value: "59,90 €",
      kind: "money",
      factKey: "charge.amount",
    });
    expect(highlights[1]?.value).toBe("01/07/2026");
    expect(highlights[2]?.value).toBe("10/06/2026");
  });

  it("leaves out booleans, unnamed facts and unconfirmed data", () => {
    const highlights = buildCaseHighlights(
      [
        ...FACTS,
        { key: "internal.unknown", value: { type: "date", value: "2026-01-01" }, status: "CONFIRMED" },
        {
          key: "charge.date",
          value: { type: "date", value: "2026-08-08" },
          status: "UNCONFIRMED",
        },
      ],
      LABELS,
    );

    expect(highlights.every((h) => h.kind === "money" || h.kind === "date")).toBe(true);
    expect(highlights.some((h) => h.label === "internal.unknown")).toBe(false);
    // The unconfirmed duplicate never replaces the confirmed date.
    expect(highlights.filter((h) => h.factKey === "charge.date")).toHaveLength(1);
    expect(highlights.find((h) => h.factKey === "charge.date")?.value).toBe("01/07/2026");
  });

  it("returns nothing when there is nothing to show", () => {
    expect(buildCaseHighlights([], LABELS)).toEqual([]);
  });
});
