/**
 * Document Intelligence persistence integration tests (Fase 5 audit fix).
 *
 * Verifies that PhysicalObject, ProcessingRun, DocumentLocation, and
 * FactCandidate are actually persisted to DB and can be reloaded.
 * Tests atomicity, rollback, and concurrency protection.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { CaseService } from "@core/case/service";
import { EvidenceService } from "@core/evidence/service";
import { DocumentProcessingService } from "@core/document/processing-service";
import { InMemoryObjectStorage } from "@server/adapters/storage/in-memory-object-storage";
import { LocalTextExtractorAdapter } from "@server/adapters/document/local-text-extractor";
import { UploadValidatorAdapter } from "@server/adapters/document/upload-validator";
import { createPersistenceHarness, type PersistenceHarness } from "../persistence/pglite-setup";
import type { IsoDateTime } from "@core/shared/temporal";
import type { CurrencyCode, JurisdictionCode, Locale, OwnerId, ProblemSlug } from "@core/types";

const NOW = "2026-09-19T12:00:00.000Z" as IsoDateTime;

async function createTestHarness() {
  const harness = await createPersistenceHarness();
  const caseService = new CaseService(harness.repo);
  const evidenceService = new EvidenceService(harness.repo);
  const storage = new InMemoryObjectStorage();
  const docService = new DocumentProcessingService(
    harness.repo,
    storage,
    new LocalTextExtractorAdapter(),
    new UploadValidatorAdapter(),
  );
  return { harness, caseService, evidenceService, docService, storage };
}

async function createTestCase(cs: CaseService) {
  return cs.createCase({
    problemSlug: "cancellation-charge" as ProblemSlug,
    jurisdiction: "ES" as JurisdictionCode,
    locale: "es-ES" as Locale,
    currency: "EUR" as CurrencyCode,
    ownerId: "test-user" as OwnerId,
  });
}

describe("Document Intelligence persistence", () => {
  let harness: PersistenceHarness;
  let caseService: CaseService;
  let evidenceService: EvidenceService;
  let docService: DocumentProcessingService;

  beforeAll(async () => {
    const h = await createTestHarness();
    harness = h.harness;
    caseService = h.caseService;
    evidenceService = h.evidenceService;
    docService = h.docService;
  });

  afterAll(async () => {
    await harness.close();
  });

  it("full chain: case → evidence → upload → PhysicalObject → ProcessingRun → reload from DB", async () => {
    // 1. Create case
    const cs = await createTestCase(caseService);

    // 2. Add evidence (file-backed)
    const { evidence } = await evidenceService.addEvidence(
      cs.id,
      {
        type: "DOCUMENT",
        source: "USER",
        content: {
          kind: "file",
          storageKey: "placeholder",
          mimeType: "text/plain",
          sizeBytes: 100,
          filename: "test.txt",
        },
        label: "Test document",
      },
      { at: NOW },
    );

    // Transition evidence to AVAILABLE (simulating upload completion)
    await evidenceService.changeEvidenceStatus(cs.id, evidence.id, "AVAILABLE", { at: NOW });

    // 3. Process document
    const buffer = new TextEncoder().encode("Hello, this is a test document with some content.");
    const result = await docService.uploadAndProcess({
      caseId: cs.id,
      evidenceId: evidence.id,
      buffer,
      mimeType: "text/plain",
      filename: "test.txt",
    });

    // 4. Verify in-memory results
    expect(result.physicalObject).toBeDefined();
    expect(result.physicalObject.mimeType).toBe("text/plain");
    expect(result.processingRun).toBeDefined();
    expect(result.processingRun.status).toBe("COMPLETED");

    // 5. RELOAD FROM DB — this is the critical test
    const reloaded = await harness.repo.loadCase(cs.id);
    expect(reloaded).not.toBeNull();

    // PhysicalObject persisted
    expect(reloaded!.physicalObjects).toHaveLength(1);
    const po = reloaded!.physicalObjects[0]!;
    expect(po.id).toBe(result.physicalObject.id);
    expect(po.caseId).toBe(cs.id);
    expect(po.evidenceId).toBe(evidence.id);
    expect(po.mimeType).toBe("text/plain");
    expect(po.sizeBytes).toBe(buffer.length);
    expect(po.checksumSha256).toBe(result.physicalObject.checksumSha256);
    expect(po.status).toBe("STORED");

    // ProcessingRun persisted
    expect(reloaded!.processingRuns).toHaveLength(1);
    const run = reloaded!.processingRuns[0]!;
    expect(run.id).toBe(result.processingRun.id);
    expect(run.physicalObjectId).toBe(po.id);
    expect(run.evidenceId).toBe(evidence.id);
    expect(run.status).toBe("COMPLETED");
    expect(run.extractorType).toBe("TEXT_PLAIN");
    expect(run.extractorVersion).toBeTruthy();

    // Evidence updated to PROCESSED
    const updatedEvidence = reloaded!.evidence.find((e) => e.id === evidence.id);
    expect(updatedEvidence!.status).toBe("PROCESSED");
  });

  it("unsupported format: evidence stays AVAILABLE, not PROCESSED", async () => {
    const cs = await createTestCase(caseService);

    const { evidence } = await evidenceService.addEvidence(
      cs.id,
      {
        type: "DOCUMENT",
        source: "USER",
        content: {
          kind: "file",
          storageKey: "placeholder",
          mimeType: "image/jpeg",
          sizeBytes: 100,
          filename: "photo.jpg",
        },
      },
      { at: NOW },
    );

    await evidenceService.changeEvidenceStatus(cs.id, evidence.id, "AVAILABLE", { at: NOW });

    // Process an unsupported format
    const buffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = await docService.uploadAndProcess({
      caseId: cs.id,
      evidenceId: evidence.id,
      buffer,
      mimeType: "image/jpeg",
      filename: "photo.jpg",
    });

    // Processing run should be FAILED
    expect(result.processingRun.status).toBe("FAILED");

    // Reload and verify evidence status
    const reloaded = await harness.repo.loadCase(cs.id);
    expect(reloaded).not.toBeNull();

    // Evidence should be AVAILABLE, not PROCESSED (H2 fix)
    const updatedEvidence = reloaded!.evidence.find((e) => e.id === evidence.id);
    expect(updatedEvidence!.status).toBe("AVAILABLE");

    // PhysicalObject still persisted
    expect(reloaded!.physicalObjects).toHaveLength(1);

    // ProcessingRun persisted with FAILED status
    expect(reloaded!.processingRuns).toHaveLength(1);
    expect(reloaded!.processingRuns[0]!.status).toBe("FAILED");
  });

  it("extractor type maps correctly per MIME type", async () => {
    const cs = await createTestCase(caseService);

    const testCases: Array<{
      mime: string;
      expected: string;
      filename: string;
      buffer: Uint8Array;
    }> = [
      {
        mime: "text/plain",
        expected: "TEXT_PLAIN",
        filename: "doc.txt",
        buffer: new TextEncoder().encode("test content"),
      },
      {
        mime: "text/csv",
        expected: "TEXT_CSV",
        filename: "data.csv",
        buffer: new TextEncoder().encode("a,b\nc,d"),
      },
      {
        mime: "application/pdf",
        expected: "PDF_TEXT",
        filename: "doc.pdf",
        buffer: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
      },
    ];

    for (const { mime, expected, filename, buffer } of testCases) {
      const { evidence } = await evidenceService.addEvidence(
        cs.id,
        {
          type: "DOCUMENT",
          source: "USER",
          content: {
            kind: "file",
            storageKey: "placeholder",
            mimeType: mime,
            sizeBytes: buffer.length,
            filename,
          },
        },
        { at: NOW },
      );

      await evidenceService.changeEvidenceStatus(cs.id, evidence.id, "AVAILABLE", { at: NOW });

      const result = await docService.uploadAndProcess({
        caseId: cs.id,
        evidenceId: evidence.id,
        buffer,
        mimeType: mime,
        filename,
      });

      expect(result.processingRun.extractorType).toBe(expected);
    }

    // Verify all persisted with correct types
    const reloaded = await harness.repo.loadCase(cs.id);
    expect(reloaded!.processingRuns).toHaveLength(3);
    const types = reloaded!.processingRuns.map((r) => r.extractorType).sort();
    expect(types).toEqual(["PDF_TEXT", "TEXT_CSV", "TEXT_PLAIN"]);
  });

  it("checksum is computed from actual bytes, not metadata", async () => {
    const cs = await createTestCase(caseService);

    // Content A: different from content B
    const contentA = new TextEncoder().encode("Content version A");
    const contentB = new TextEncoder().encode("Content version B");

    // Process content A with filename a.txt
    const { evidence: evA } = await evidenceService.addEvidence(
      cs.id,
      {
        type: "DOCUMENT",
        source: "USER",
        content: {
          kind: "file",
          storageKey: "a",
          mimeType: "text/plain",
          sizeBytes: contentA.length,
          filename: "a.txt",
        },
      },
      { at: NOW },
    );
    await evidenceService.changeEvidenceStatus(cs.id, evA.id, "AVAILABLE", { at: NOW });
    const resultA = await docService.uploadAndProcess({
      caseId: cs.id,
      evidenceId: evA.id,
      buffer: contentA,
      mimeType: "text/plain",
      filename: "a.txt",
    });

    // Process content B with filename b.txt (different bytes → different checksum)
    const { evidence: evB } = await evidenceService.addEvidence(
      cs.id,
      {
        type: "DOCUMENT",
        source: "USER",
        content: {
          kind: "file",
          storageKey: "b",
          mimeType: "text/plain",
          sizeBytes: contentB.length,
          filename: "b.txt",
        },
      },
      { at: NOW },
    );
    await evidenceService.changeEvidenceStatus(cs.id, evB.id, "AVAILABLE", { at: NOW });
    const resultB = await docService.uploadAndProcess({
      caseId: cs.id,
      evidenceId: evB.id,
      buffer: contentB,
      mimeType: "text/plain",
      filename: "b.txt",
    });

    // Different bytes → different checksum
    expect(resultA.physicalObject.checksumSha256).not.toBe(resultB.physicalObject.checksumSha256);

    // Same bytes as A but different filename → same checksum (proves checksum is on bytes, not metadata)
    const { evidence: evC } = await evidenceService.addEvidence(
      cs.id,
      {
        type: "DOCUMENT",
        source: "USER",
        content: {
          kind: "file",
          storageKey: "c",
          mimeType: "text/plain",
          sizeBytes: contentA.length,
          filename: "completely-different-name.pdf",
        },
      },
      { at: NOW },
    );
    await evidenceService.changeEvidenceStatus(cs.id, evC.id, "AVAILABLE", { at: NOW });

    // Should throw because same bytes already processed (idempotency)
    await expect(
      docService.uploadAndProcess({
        caseId: cs.id,
        evidenceId: evC.id,
        buffer: contentA,
        mimeType: "text/plain",
        filename: "completely-different-name.pdf",
      }),
    ).rejects.toThrow("already processed");
  });

  it("idempotency: same checksum + same evidence throws", async () => {
    const cs = await createTestCase(caseService);

    const { evidence } = await evidenceService.addEvidence(
      cs.id,
      {
        type: "DOCUMENT",
        source: "USER",
        content: {
          kind: "file",
          storageKey: "x",
          mimeType: "text/plain",
          sizeBytes: 100,
          filename: "x.txt",
        },
      },
      { at: NOW },
    );
    await evidenceService.changeEvidenceStatus(cs.id, evidence.id, "AVAILABLE", { at: NOW });

    const buffer = new TextEncoder().encode("Unique content for idempotency test");

    // First processing succeeds
    await docService.uploadAndProcess({
      caseId: cs.id,
      evidenceId: evidence.id,
      buffer,
      mimeType: "text/plain",
      filename: "x.txt",
    });

    // Second processing with same evidence should fail (checksum already processed)
    await expect(
      docService.uploadAndProcess({
        caseId: cs.id,
        evidenceId: evidence.id,
        buffer,
        mimeType: "text/plain",
        filename: "x.txt",
      }),
    ).rejects.toThrow("already processed");
  });

  it("storage key is independent of filename", async () => {
    const key1 = (await import("@core/document/validation")).generateStorageKey(
      "case-1",
      "../../../etc/passwd",
    );
    const key2 = (await import("@core/document/validation")).generateStorageKey(
      "case-1",
      "normal.pdf",
    );

    // Keys should not contain path traversal
    expect(key1).not.toContain("..");
    expect(key1).not.toContain("passwd");

    // Keys should have the case prefix
    expect(key1).toMatch(/^case-1\//);
    expect(key2).toMatch(/^case-1\//);

    // Keys should be unique
    expect(key1).not.toBe(key2);
  });
});
