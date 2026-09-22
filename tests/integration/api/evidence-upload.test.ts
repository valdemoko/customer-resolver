/**
 * Evidence upload route over real persistence.
 *
 * The route is exercised end to end (multipart parsing → validation → storage →
 * text extraction → processing run persisted → response shape) against the real
 * SQL schema, with only the environment/driver mocked to point at the harness.
 *
 * This is the path the user asked for: "subo el PDF y se analizan sus datos".
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createPersistenceHarness, type PersistenceHarness } from "../persistence/pglite-setup";

let harness: PersistenceHarness;

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    DATABASE_URL: "postgresql://harness/local",
    NODE_ENV: "test",
  }),
  getPublicEnv: () => ({}),
}));

// The route builds the Drizzle client from env; point it at the harness instead.
vi.mock("@server/db/client", () => ({
  createNeonDb: () => harness.db,
}));

type PostHandler = (
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) => Promise<Response>;

let POST: PostHandler;

function uploadRequest(markdown: string, filename: string, mimeType: string): Request {
  const form = new FormData();
  form.append("file", new File([new TextEncoder().encode(markdown)], filename, { type: mimeType }));
  return new Request("http://localhost/api/cases/x/evidence", { method: "POST", body: form });
}

async function createCase(): Promise<string> {
  const { DrizzleCaseRepository } = await import("@server/db/repositories/case-repository");
  const { CaseService } = await import("@core/case/service");
  const repo = new DrizzleCaseRepository(harness.db);
  const created = await new CaseService(repo).createCase({
    problemSlug: "warranty-rejection" as never,
    jurisdiction: "ES" as never,
    locale: "es-ES" as never,
    currency: "EUR" as never,
    ownerId: "anonymous" as never,
  });
  return created.id;
}

describe("POST /api/cases/[caseId]/evidence", () => {
  beforeAll(async () => {
    harness = await createPersistenceHarness();
    const route = await import("@/app/api/cases/[caseId]/evidence/route");
    POST = route.POST as unknown as PostHandler;
  });

  afterAll(async () => {
    await harness.close();
  });

  it("rejects a request without a file", async () => {
    const caseId = await createCase();
    const request = new Request("http://localhost/api/cases/x/evidence", {
      method: "POST",
      body: new FormData(),
    });

    const res = await POST(request, { params: Promise.resolve({ caseId }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown case", async () => {
    const res = await POST(uploadRequest("texto", "factura.txt", "text/plain"), {
      params: Promise.resolve({ caseId: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });

  it("reads a text document and returns its extracted data", async () => {
    const caseId = await createCase();
    const res = await POST(
      uploadRequest(
        "Factura de compra. Fecha de entrega: 2026-05-01. Importe total: 249,90 euros.",
        "factura.txt",
        "text/plain",
      ),
      { params: Promise.resolve({ caseId }) },
    );

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.evidenceId).toBeTruthy();
    expect(data.processingRunId).toBeTruthy();
    expect(data.status).toBe("COMPLETED");
    expect(data.extractorType).toBe("TEXT_PLAIN");
    expect(data.extractedCharacters).toBeGreaterThan(20);
    // Candidates are proposals, never facts.
    expect(Array.isArray(data.candidates)).toBe(true);

    // The evidence and the processing run are actually persisted on the case.
    const { DrizzleCaseRepository } = await import("@server/db/repositories/case-repository");
    const loaded = await new DrizzleCaseRepository(harness.db).loadCase(caseId);
    expect(loaded?.evidence.some((e) => e.id === data.evidenceId)).toBe(true);
    expect(loaded?.processingRuns.some((run) => run.id === data.processingRunId)).toBe(true);
  });

  it("rejects an unsupported file type with a clear status", async () => {
    const caseId = await createCase();
    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], "programa.exe", {
        type: "application/x-msdownload",
      }),
    );

    const res = await POST(
      new Request("http://localhost/api/cases/x/evidence", { method: "POST", body: form }),
      { params: Promise.resolve({ caseId }) },
    );

    expect([413, 422]).toContain(res.status);
    const data = await res.json();
    expect(data.error?.message).toBeTruthy();
  });
});
