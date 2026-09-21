/**
 * Cloudflare R2 object storage adapter (Fase 11).
 *
 * R2 is S3-compatible — uses the AWS SDK S3 client with R2 endpoint.
 * Implements the ObjectStoragePort defined in core/document/ports.ts.
 *
 * The core never imports this module. All R2 details are infrastructure.
 *
 * Key design:
 *   - System-generated storage keys (never user-provided filenames)
 *   - All operations are idempotent per S3 semantics
 *   - R2 is private (no public access) — objects are accessed via presigned URLs
 *   - Checksum computed on upload for integrity verification
 */
import { createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { ObjectMetadata, ObjectStoragePort, PutObjectInput } from "@core/document/ports";

export interface R2StorageConfig {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Create an R2-compatible S3 client.
 * R2 endpoint: https://{accountId}.r2.cloudflarestorage.com
 */
function createR2Client(config: R2StorageConfig): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // R2 supports S3 API; force path-style for compatibility
    forcePathStyle: true,
  });
}

export class R2ObjectStorage implements ObjectStoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2StorageConfig) {
    this.client = createR2Client(config);
    this.bucket = config.bucketName;
  }

  async put(input: PutObjectInput): Promise<ObjectMetadata> {
    const checksumSha256 = createHash("sha256").update(input.body).digest("hex");

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: input.metadata,
        // Store checksum as custom metadata for verification
        ChecksumSHA256: checksumSha256,
      }),
    );

    return {
      key: input.key,
      contentType: input.contentType,
      sizeBytes: input.body.length,
      checksumSha256,
      lastModified: new Date().toISOString(),
    };
  }

  async get(key: string): Promise<Uint8Array> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error(`Object not found: ${key}`);
    }

    // Convert readable stream to Uint8Array
    const bytes = await response.Body.transformToByteArray();
    return new Uint8Array(bytes);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (error: unknown) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async getMetadata(key: string): Promise<ObjectMetadata> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    return {
      key,
      contentType: response.ContentType ?? "application/octet-stream",
      sizeBytes: response.ContentLength ?? 0,
      checksumSha256: response.ChecksumSHA256 ?? "",
      lastModified: response.LastModified?.toISOString(),
    };
  }

  async delete(key: string): Promise<void> {
    // Idempotent: deleting a nonexistent key is a no-op (S3 semantics)
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  /**
   * List all objects with a given prefix.
   * Useful for orphan cleanup and case deletion.
   */
  async listByPrefix(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) keys.push(obj.Key);
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }

  /**
   * Delete all objects with a given prefix (for case deletion cleanup).
   * Uses batch delete for efficiency.
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    const keys = await this.listByPrefix(prefix);
    if (keys.length === 0) return 0;

    // S3 batch delete supports up to 1000 keys per request
    const BATCH_SIZE = 1000;
    let deleted = 0;

    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);
      const { DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
      deleted += batch.length;
    }

    return deleted;
  }
}
