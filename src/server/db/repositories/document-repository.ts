/**
 * Document Repository (Fase 12).
 *
 * Drizzle adapter for generated document persistence.
 * Handles CRUD operations, versioning, and storage key management.
 */
import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generatedDocuments } from "../schema";
import { now as systemNow } from "@core/shared/temporal";
import type {
  GeneratedDocument,
  DocumentStatus,
} from "@core/document-generation/types";

type Db = NodePgDatabase<Record<string, never>>;

function mapDocument(row: typeof generatedDocuments.$inferSelect): GeneratedDocument {
  const content = row.content as Record<string, unknown>;
  return {
    id: row.id,
    caseId: row.caseId,
    type: row.type as GeneratedDocument["type"],
    status: row.status as DocumentStatus,
    version: row.version,
    format: row.format as GeneratedDocument["format"],
    title: row.title,
    recipient: row.recipient,
    subject: row.subject,
    sections: (content.sections ?? []) as GeneratedDocument["sections"],
    factualStatements: (content.factualStatements ?? []) as GeneratedDocument["factualStatements"],
    legalStatements: (content.legalStatements ?? []) as GeneratedDocument["legalStatements"],
    citations: (content.citations ?? []) as GeneratedDocument["citations"],
    unresolvedItems: (content.unresolvedItems ?? []) as GeneratedDocument["unresolvedItems"],
    analysisSnapshotId: row.analysisSnapshotId ?? undefined,
    aiRequestId: row.aiRequestId ?? undefined,
    promptId: row.promptId ?? undefined,
    promptVersion: row.promptVersion ?? undefined,
    storageKey: row.storageKey ?? undefined,
    fileSize: row.fileSize ?? undefined,
    previousVersionId: row.previousVersionId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DocumentRepository {
  constructor(private readonly db: Db) {}

  async create(doc: GeneratedDocument): Promise<GeneratedDocument> {
    const now = systemNow();
    const [row] = await this.db
      .insert(generatedDocuments)
      .values({
        id: doc.id,
        caseId: doc.caseId,
        type: doc.type,
        status: doc.status,
        version: doc.version,
        format: doc.format,
        title: doc.title,
        recipient: doc.recipient,
        subject: doc.subject,
        content: {
          sections: doc.sections,
          factualStatements: doc.factualStatements,
          legalStatements: doc.legalStatements,
          citations: doc.citations,
          unresolvedItems: doc.unresolvedItems,
        },
        analysisSnapshotId: doc.analysisSnapshotId ?? null,
        aiRequestId: doc.aiRequestId ?? null,
        promptId: doc.promptId ?? null,
        promptVersion: doc.promptVersion ?? null,
        storageKey: doc.storageKey ?? null,
        fileSize: doc.fileSize ?? null,
        previousVersionId: doc.previousVersionId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return mapDocument(row!);
  }

  async findById(docId: string): Promise<GeneratedDocument | null> {
    const [row] = await this.db
      .select()
      .from(generatedDocuments)
      .where(eq(generatedDocuments.id, docId))
      .limit(1);

    return row ? mapDocument(row) : null;
  }

  async listByCase(caseId: string): Promise<readonly GeneratedDocument[]> {
    const rows = await this.db
      .select()
      .from(generatedDocuments)
      .where(eq(generatedDocuments.caseId, caseId))
      .orderBy(asc(generatedDocuments.createdAt));

    return rows.map(mapDocument);
  }

  async getLatestVersion(caseId: string): Promise<GeneratedDocument | null> {
    const rows = await this.db
      .select()
      .from(generatedDocuments)
      .where(eq(generatedDocuments.caseId, caseId))
      .orderBy(asc(generatedDocuments.version))
      .limit(100); // Get all, take last

    if (rows.length === 0) return null;
    return mapDocument(rows[rows.length - 1]!);
  }

  async getVersion(caseId: string, version: number): Promise<GeneratedDocument | null> {
    const [row] = await this.db
      .select()
      .from(generatedDocuments)
      .where(
        and(
          eq(generatedDocuments.caseId, caseId),
          eq(generatedDocuments.version, version),
        ),
      )
      .limit(1);

    return row ? mapDocument(row) : null;
  }

  async updateStatus(
    docId: string,
    status: DocumentStatus,
  ): Promise<GeneratedDocument | null> {
    const now = systemNow();
    const [row] = await this.db
      .update(generatedDocuments)
      .set({ status, updatedAt: now })
      .where(eq(generatedDocuments.id, docId))
      .returning();

    return row ? mapDocument(row) : null;
  }

  async updateStorage(
    docId: string,
    storageKey: string,
    fileSize: number,
  ): Promise<GeneratedDocument | null> {
    const now = systemNow();
    const [row] = await this.db
      .update(generatedDocuments)
      .set({ storageKey, fileSize, updatedAt: now })
      .where(eq(generatedDocuments.id, docId))
      .returning();

    return row ? mapDocument(row) : null;
  }

  async delete(docId: string): Promise<void> {
    await this.db
      .delete(generatedDocuments)
      .where(eq(generatedDocuments.id, docId));
  }
}
