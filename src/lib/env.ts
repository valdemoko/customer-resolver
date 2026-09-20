/**
 * Shared environment schema (Zod).
 *
 * Secrets stay server-only: nothing here is imported by client components.
 * Actual .env files are not committed (see .gitignore) — this only validates shape.
 *
 * NOTE (Phase 0): only NEXT_PUBLIC_SITE_URL is required. Everything else is
 * optional-with-placeholder until its phase implements it (Fase 1: DATABASE_URL;
 * Fase 5: R2; Fase 6: AI keys). Placeholders are NOT secrets and contain no real values.
 */
import { z } from "zod";

const serverEnvSchema = z.object({
  // Fase 1 (database) — optional in Phase 0, validated when present.
  DATABASE_URL: z.string().url().optional(),

  // Fase 5 (object storage) — placeholders documented in .env.example.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET_DOCUMENTS: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),

  // Fase 6 (AI providers) — placeholders documented in .env.example.
  // Keys are never required: without them the AI layer degrades to typed
  // AI_PROVIDER_UNAVAILABLE errors (development/test keep working).
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  // Fase 6 (AI orchestration tuning) — server-side only.
  AI_DEFAULT_PROVIDER: z.string().optional(),
  AI_DEFAULT_MODEL: z.string().optional(),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).optional(),

  // Email (Fase 2) — placeholder.
  RESEND_API_KEY: z.string().optional(),
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;

/** Validate and return server environment. Call only from server code. */
export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

let cachedPublicEnv: PublicEnv | undefined;

/** Validate and return public environment (safe for client). */
export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;
  const parsed = publicEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid public environment: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}
