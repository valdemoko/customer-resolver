/**
 * Structured-output parsing: explicit nulls must not discard a valid answer.
 *
 * Production regression: the model wrote `"normalizedValue": null` / `"problemKey": null`
 * for fields that did not apply, the schema expressed that as "omitted", and the
 * whole interpretation was rejected → 503 on every request whose problem matched
 * no module exactly.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AIError } from "@core/ai/errors";
import { parseStructuredOutput } from "@core/ai/structured-output";

const context = { promptId: "test", promptVersion: 1 };

const schema = z
  .object({
    summary: z.string(),
    candidateModules: z.array(
      z.object({
        problemKey: z.string(),
        confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
      }),
    ),
    entities: z.array(
      z.object({
        type: z.string(),
        normalizedValue: z.string().optional(),
      }),
    ),
  })
  .strict();

describe("parseStructuredOutput", () => {
  it("accepts a payload that uses explicit nulls for optional fields", () => {
    const raw = JSON.stringify({
      summary: "Situación descrita",
      candidateModules: [{ problemKey: "warranty-rejection", confidence: "HIGH" }],
      entities: [
        { type: "PRODUCT", normalizedValue: "portátil" },
        { type: "DATE_EXPRESSION", normalizedValue: null },
      ],
    });

    const parsed = parseStructuredOutput(raw, schema, context);
    expect(parsed.data.entities).toHaveLength(2);
    expect(parsed.data.entities[1]).toEqual({ type: "DATE_EXPRESSION" });
  });

  it("accepts a null where an empty list is meant only when the schema allows absence", () => {
    const raw = JSON.stringify({ summary: "x", candidateModules: [], entities: [] });
    expect(parseStructuredOutput(raw, schema, context).data.candidateModules).toEqual([]);
  });

  it("still rejects a null in a REQUIRED position", () => {
    const raw = JSON.stringify({
      summary: null,
      candidateModules: [],
      entities: [],
    });

    expect(() => parseStructuredOutput(raw, schema, context)).toThrow(AIError);
  });

  it("still rejects unknown fields and invalid enums", () => {
    expect(() =>
      parseStructuredOutput(
        JSON.stringify({ summary: "x", candidateModules: [], entities: [], extra: 1 }),
        schema,
        context,
      ),
    ).toThrow(AIError);

    expect(() =>
      parseStructuredOutput(
        JSON.stringify({
          summary: "x",
          candidateModules: [{ problemKey: "a", confidence: "MAYBE" }],
          entities: [],
        }),
        schema,
        context,
      ),
    ).toThrow(AIError);
  });

  it("reports invalid JSON as such", () => {
    expect(() => parseStructuredOutput("not json", schema, context)).toThrow(AIError);
  });
});
