/**
 * InMemoryObjectStorage tests (Fase 5).
 * Tests the test adapter itself — deterministic, no network, no disk.
 */
import { describe, expect, it } from "vitest";
import { InMemoryObjectStorage } from "@server/adapters/storage/in-memory-object-storage";

describe("InMemoryObjectStorage", () => {
  it("stores and retrieves objects", async () => {
    const storage = new InMemoryObjectStorage();
    const body = new TextEncoder().encode("Hello, world!");

    await storage.put({
      key: "test/key.txt",
      body,
      contentType: "text/plain",
    });

    const retrieved = await storage.get("test/key.txt");
    expect(retrieved).toEqual(body);
  });

  it("returns copies to prevent mutation", async () => {
    const storage = new InMemoryObjectStorage();
    const body = new Uint8Array([1, 2, 3]);

    await storage.put({ key: "k", body, contentType: "text/plain" });
    const retrieved = await storage.get("k");
    retrieved[0] = 99; // Mutate the copy

    const original = await storage.get("k");
    expect(original[0]).toBe(1); // Original unchanged
  });

  it("checks existence", async () => {
    const storage = new InMemoryObjectStorage();
    expect(await storage.exists("missing")).toBe(false);

    await storage.put({ key: "exists", body: new Uint8Array(1), contentType: "text/plain" });
    expect(await storage.exists("exists")).toBe(true);
  });

  it("returns metadata with checksum", async () => {
    const storage = new InMemoryObjectStorage();
    const body = new TextEncoder().encode("test content");

    const meta = await storage.put({ key: "k", body, contentType: "text/plain" });
    expect(meta.key).toBe("k");
    expect(meta.contentType).toBe("text/plain");
    expect(meta.sizeBytes).toBe(body.length);
    expect(meta.checksumSha256).toBeTruthy();
    expect(meta.checksumSha256.length).toBe(64); // SHA-256 hex
  });

  it("computes consistent checksums", async () => {
    const storage = new InMemoryObjectStorage();
    const body = new TextEncoder().encode("same content");

    const meta1 = await storage.put({ key: "a", body, contentType: "text/plain" });
    const meta2 = await storage.put({ key: "b", body, contentType: "text/plain" });
    expect(meta1.checksumSha256).toBe(meta2.checksumSha256);
  });

  it("different content produces different checksums", async () => {
    const storage = new InMemoryObjectStorage();

    const meta1 = await storage.put({
      key: "a",
      body: new TextEncoder().encode("content A"),
      contentType: "text/plain",
    });
    const meta2 = await storage.put({
      key: "b",
      body: new TextEncoder().encode("content B"),
      contentType: "text/plain",
    });
    expect(meta1.checksumSha256).not.toBe(meta2.checksumSha256);
  });

  it("deletes objects", async () => {
    const storage = new InMemoryObjectStorage();
    await storage.put({ key: "k", body: new Uint8Array(1), contentType: "text/plain" });
    expect(await storage.exists("k")).toBe(true);

    await storage.delete("k");
    expect(await storage.exists("k")).toBe(false);
  });

  it("delete is idempotent", async () => {
    const storage = new InMemoryObjectStorage();
    await storage.delete("nonexistent"); // Should not throw
  });

  it("throws on get of missing object", async () => {
    const storage = new InMemoryObjectStorage();
    await expect(storage.get("missing")).rejects.toThrow("not found");
  });

  it("throws on getMetadata of missing object", async () => {
    const storage = new InMemoryObjectStorage();
    await expect(storage.getMetadata("missing")).rejects.toThrow("not found");
  });

  it("clear helper works", async () => {
    const storage = new InMemoryObjectStorage();
    await storage.put({ key: "a", body: new Uint8Array(1), contentType: "text/plain" });
    expect(storage.size).toBe(1);

    storage.clear();
    expect(storage.size).toBe(0);
  });
});
