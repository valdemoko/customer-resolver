/**
 * In-memory ObjectStorage adapter (Fase 5).
 *
 * For tests and local development. Deterministic, no network, no disk.
 * Implements the ObjectStoragePort defined in core/document/ports.ts.
 */
import { createHash } from "node:crypto";
import type { ObjectMetadata, ObjectStoragePort, PutObjectInput } from "@core/document/ports";

interface StoredObject {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly metadata?: Record<string, string>;
}

export class InMemoryObjectStorage implements ObjectStoragePort {
  private store = new Map<string, StoredObject>();

  async put(input: PutObjectInput): Promise<ObjectMetadata> {
    const checksumSha256 = createHash("sha256").update(input.body).digest("hex");
    this.store.set(input.key, {
      body: input.body,
      contentType: input.contentType,
      metadata: input.metadata,
    });
    return {
      key: input.key,
      contentType: input.contentType,
      sizeBytes: input.body.length,
      checksumSha256,
      lastModified: new Date().toISOString(),
    };
  }

  async get(key: string): Promise<Uint8Array> {
    const obj = this.store.get(key);
    if (!obj) throw new Error(`Object not found: ${key}`);
    // Return a copy to prevent mutation
    return new Uint8Array(obj.body);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async getMetadata(key: string): Promise<ObjectMetadata> {
    const obj = this.store.get(key);
    if (!obj) throw new Error(`Object not found: ${key}`);
    const checksumSha256 = createHash("sha256").update(obj.body).digest("hex");
    return {
      key,
      contentType: obj.contentType,
      sizeBytes: obj.body.length,
      checksumSha256,
    };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key); // Idempotent
  }

  /** Test helper: clear all objects. */
  clear(): void {
    this.store.clear();
  }

  /** Test helper: count stored objects. */
  get size(): number {
    return this.store.size;
  }
}
