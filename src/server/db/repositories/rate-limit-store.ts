/**
 * Persistent rate limiting store (Fase 11).
 *
 * Distributed, DB-backed sliding-window rate limiter using PostgreSQL.
 * Each scope (e.g. "intake:interpret", "case:create") has configurable
 * limits per window.
 *
 * Atomic operations:
 *   - checkAndIncrement: INSERT-or-UPDATE with WHERE count < max.
 *     If the WHERE blocks the update, RETURNING returns no row → rejected.
 *   - cleanup: removes expired windows
 */
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { rateLimits } from "@server/db/schema";
import { now as systemNow } from "@core/shared/temporal";

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  maxRequests: number;
  retryAfterMs: number;
}

export interface RateLimitStore {
  checkAndIncrement(scope: string, key: string, config: RateLimitConfig): Promise<RateLimitResult>;
  cleanup(): Promise<number>;
  reset(scope: string, key: string): Promise<void>;
}

type Db = NodePgDatabase<Record<string, never>>;

/**
 * PostgreSQL-backed rate limiter.
 *
 * Uses unique index on (scope, key, window_start) for atomic insert-or-increment.
 * The WHERE clause on onConflictDoUpdate ensures the counter never exceeds the limit:
 * - If no row exists: INSERT with count=1 (always allowed for first request)
 * - If row exists AND count < max: UPDATE count = count + 1 (allowed)
 * - If row exists AND count >= max: WHERE blocks update, RETURNING returns nothing (rejected)
 */
export class DrizzleRateLimitStore implements RateLimitStore {
  constructor(private readonly db: Db) {}

  private getWindowStart(windowMs: number): Date {
    const now = Date.now();
    const aligned = Math.floor(now / windowMs) * windowMs;
    return new Date(aligned);
  }

  async checkAndIncrement(
    scope: string,
    key: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const now = systemNow();
    const windowStart = this.getWindowStart(config.windowMs);
    const expiresAt = new Date(windowStart.getTime() + config.windowMs).toISOString();

    // Atomic: INSERT new row (count=1) OR UPDATE existing row only if count < max.
    // If the WHERE blocks the UPDATE, RETURNING returns no row → request rejected.
    const [row] = await this.db
      .insert(rateLimits)
      .values({
        scope,
        key,
        windowStart: windowStart.toISOString(),
        count: 1,
        maxRequests: config.maxRequests,
        expiresAt,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [rateLimits.scope, rateLimits.key, rateLimits.windowStart],
        set: {
          count: sql`${rateLimits.count} + 1`,
        },
        where: sql`${rateLimits.count} < ${rateLimits.maxRequests}`,
      })
      .returning({
        count: rateLimits.count,
        maxRequests: rateLimits.maxRequests,
      });

    if (!row) {
      // WHERE blocked the update — budget exhausted
      return {
        allowed: false,
        currentCount: config.maxRequests,
        maxRequests: config.maxRequests,
        retryAfterMs: Math.max(0, windowStart.getTime() + config.windowMs - Date.now()),
      };
    }

    // Row was inserted or updated — check if within limit
    // After INSERT: count=1, always allowed
    // After UPDATE: count was incremented, check if still within limit
    const allowed = row.count <= row.maxRequests;
    const retryAfterMs = allowed
      ? 0
      : Math.max(0, windowStart.getTime() + config.windowMs - Date.now());

    return {
      allowed,
      currentCount: row.count,
      maxRequests: row.maxRequests,
      retryAfterMs,
    };
  }

  async cleanup(): Promise<number> {
    const now = systemNow();
    await this.db
      .delete(rateLimits)
      .where(sql`${rateLimits.expiresAt} < ${now}`);
    // rowCount not available on Drizzle return type — best-effort cleanup
    return 0;
  }

  async reset(scope: string, key: string): Promise<void> {
    await this.db
      .delete(rateLimits)
      .where(and(eq(rateLimits.scope, scope), eq(rateLimits.key, key)));
  }
}
