# Phase 6 Report — AI Orchestration

**Date:** 2026-09-20 · **Status:** APPROVED · **Verification:** all commands executed.

## 1. What Was Implemented

AI Orchestration layer: provider abstraction, typed error taxonomy, capability-driven router with retries/fallback, prompt versioning, structured output validation (Zod), input hashing, cost tracking, prompt-injection defense, document fact extraction integration (F5↔F6), AI request provenance, Groq/OpenAI adapters (fetch-based, no SDKs), database audit table, and full test coverage.

**AI is an interpreter, never the source of truth.** It produces candidates and interpretations that flow through Evidence → Rule Engine → validated result. No AI output is auto-confirmed.

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  F5: Evidence + Document Text + Problem Fact Keys           │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  AI Orchestration (F6)                                      │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Prompt      │  │ Token Budget │  │ Sanitize          │  │
│  │ Registry    │  │ (deterministic│  │ (injection defense│  │
│  │ (versioned) │  │  truncation) │  │  + delimiters)    │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬──────────┘  │
│         │                │                   │              │
│         └────────────────┼───────────────────┘              │
│                          │                                  │
│                 ┌────────▼────────┐                         │
│                 │   AIRouter      │                         │
│                 │ (capability     │                         │
│                 │  selection,     │                         │
│                 │  retry,         │                         │
│                 │  fallback,      │                         │
│                 │  provenance)    │                         │
│                 └────────┬────────┘                         │
│                          │                                  │
│         ┌────────────────┼────────────────┐                │
│         ▼                ▼                ▼                │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Groq adapter│  │ OpenAI adapter│  │ (future)     │      │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                │                  │               │
│         └────────────────┼──────────────────┘               │
│                          │                                  │
│                 ┌────────▼────────┐                         │
│                 │ Structured      │                         │
│                 │ Output (Zod)    │                         │
│                 └────────┬────────┘                         │
│                          │                                  │
│                 ┌────────▼────────┐                         │
│                 │ Fact Extraction │                         │
│                 │ Service         │                         │
│                 └────────┬────────┘                         │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
                    DocumentFactCandidate[]
                    (relation: PROPOSED/EXTRACTED)
                    (status: UNCONFIRMED — never auto-confirmed)
                           │
                    ┌──────▼──────┐
                    │ Rule Engine │
                    │ (F3)        │
                    └──────┬──────┘
                           │
                    validated Facts
```

### Separation of Concerns

| Layer                | Responsibility                                       | Location                           |
| -------------------- | ---------------------------------------------------- | ---------------------------------- |
| Core types           | AI domain types (request/response/usage/attempt)     | `src/core/ai/types.ts`             |
| Core errors          | Typed AI error taxonomy + transient/permanent flags  | `src/core/ai/errors.ts`            |
| Core ports           | AIProviderPort, AIRequestAuditPort                   | `src/core/ai/ports.ts`             |
| Core prompts         | Prompt registry with immutable versioning            | `src/core/ai/prompts.ts`           |
| Core sanitize        | Prompt-injection defense + untrusted data handling   | `src/core/ai/sanitize.ts`          |
| Core input hash      | Deterministic SHA-256 of logical input               | `src/core/ai/input-hash.ts`        |
| Core cost            | Versioned pricing table + cost estimation            | `src/core/ai/cost.ts`              |
| Core structured      | Zod validation pipeline (strip fences → parse → Zod) | `src/core/ai/structured-output.ts` |
| Core router          | Capability selection, retries, fallback, provenance  | `src/core/ai/router.ts`            |
| Core fact extraction | F5↔F6 integration, candidate mapping, quote locating | `src/core/ai/fact-extraction.ts`   |
| Server adapters      | Groq + OpenAI (fetch-based, no SDKs)                 | `src/server/adapters/ai/`          |
| Server DB            | ai_requests table + migration 0006 + repository      | `src/server/db/`                   |

## 3. Providers

Two adapters, both implemented as plain `fetch` to the OpenAI-compatible `/chat/completions` endpoint:

| Provider | Models                                            | Priority | Notes          |
| -------- | ------------------------------------------------- | -------- | -------------- |
| Groq     | `llama-3.1-8b-instant`, `llama-3.3-70b-versatile` | 1, 2     | Fast, cheapest |
| OpenAI   | `gpt-4o-mini`                                     | 1        | Fallback       |

**No SDKs imported** — the adapters use only `fetch` + `AbortController`. Core never touches `fetch` or provider internals (enforced by ESLint boundaries + filesystem scan test).

**Missing keys:** If `GROQ_API_KEY` / `OPENAI_API_KEY` are unset, the provider is simply not constructed. The router throws `AI_PROVIDER_UNAVAILABLE` (typed). Development and tests work without any keys.

## 4. Router

`AIRouter` implements:

1. **Capability selection:** Filters models by `taskTypes`, `structuredOutput`, `maxOutputTokens`. Sorted by priority.
2. **Bounded retries:** Per-model, transient errors only (timeout, 429, 5xx, network). Max retries configurable (default 2). Exponential backoff with jitter.
3. **Legitimate fallback:** On transient exhaustion or permanent failure, the next eligible model/provider is tried. Each provider has its own API key (no account rotation).
4. **Provenance:** Every request → `AIRequestRecord` with aiRequestId, attempts trace, usage, timing, inputHash. Persisted via `AIRequestAuditPort`.

## 5. Schemas

Fact extraction uses a strict Zod schema:

```ts
z.object({
  facts: z
    .array(
      z.object({
        factKey: z.string().min(1),
        value: z.unknown(),
        sourceQuote: z.string().min(1).optional(),
        sourceLocation: z
          .object({
            page: z.number().int().positive().optional(),
            startOffset: z.number().int().nonnegative(),
            endOffset: z.number().int().nonnegative(),
          })
          .optional(),
        certainty: z.enum(["EXPLICIT", "INFERRED", "AMBIGUOUS"]),
      }),
    )
    .max(50),
});
```

Extra top-level keys are rejected (`.strict()` at the router level prevents field smuggling).

## 6. Prompt Versioning

Immutable prompt registry:

- `promptId` + `promptVersion` → unique entry
- Re-registering the same version with different content → `AI_CONFIGURATION_ERROR`
- Every AI request records `promptId` + `promptVersion` + `outputSchemaVersion`
- Built-in prompts: `document-fact-extraction@1`, `test-echo@1`

## 7. Provenance

Every AI request generates an `AIRequestRecord`:

```ts
{
  aiRequestId: uuid,
  task, caseId?,
  providerId, modelId,
  promptId, promptVersion, outputSchemaVersion,
  inputHash: sha256,
  status: "SUCCEEDED" | "FAILED",
  usage: { inputTokens, outputTokens, totalTokens, estimatedCost, costCurrency },
  attempts: [{ attemptNumber, providerId, modelId, status, errorCode?, durationMs }],
  durationMs,
  errorCode?,
  createdAt: isoDateTime,
}
```

Persisted to `ai_requests` table (migration 0006). No prompts, no document content, no PII.

## 8. Input Hashing

Deterministic SHA-256 over canonical JSON of:

```ts
{ task, promptId, promptVersion, outputSchemaVersion, model, contentParts[] }
```

Same logical input + same prompt version + same model → same hash. Enables deduplication and audit trail. Hash covers the SANITIZED, budget-applied content actually sent.

## 9. Token/Cost Tracking

Versioned pricing table (`cost.ts`):

| Model                     | Input/1k | Output/1k | Currency |
| ------------------------- | -------- | --------- | -------- |
| `llama-3.1-8b-instant`    | $0.00005 | $0.00008  | USD      |
| `llama-3.3-70b-versatile` | $0.00059 | $0.00079  | USD      |
| `gpt-4o-mini`             | $0.00015 | $0.0006   | USD      |

Cost estimated by the core from its versioned table — never by adapters. Unknown models → `estimatedCost: null` (we do not invent prices).

## 10. Retries

- **Transient (retry):** `AI_TIMEOUT`, `AI_RATE_LIMITED`, `AI_PROVIDER_UNAVAILABLE` (5xx/network)
- **Permanent (fail fast):** `AI_INVALID_RESPONSE`, `AI_INVALID_STRUCTURED_OUTPUT`, `AI_CAPABILITY_UNAVAILABLE`, `AI_CONFIGURATION_ERROR`, `AI_POLICY_REJECTED`
- Bounded: max 2 retries per model, exponential backoff with jitter

## 11. Fallback

Legitimate multi-provider fallback:

```
groq/llama-3.1-8b-instant → timeout → groq/llama-3.1-8b-instant (retry)
  → timeout → groq/llama-3.1-8b-instant (retry exhausted)
  → openai/gpt-4o-mini → success
```

Each provider has its own API key. No account rotation, no limit evasion. Every attempt recorded in provenance.

## 12. Security — Prompt Injection

Defense-in-depth:

1. **Sanitization:** Zero-width chars stripped, instruction-override patterns neutralized (`[redacted-instruction]`)
2. **Delimiters:** Document text wrapped in `<untrusted_document>` tags; injected closing tags neutralized
3. **System prompt:** Explicitly forbids obeying instructions inside the untrusted block
4. **Schema validation:** Model output is Zod-validated; arbitrary answers rejected
5. **Tests:** Adversarial corpus (EN + ES injection patterns) in `security.test.ts`

## 13. Privacy

- **Logs never contain:** PDF content, document text, API keys, prompts, PII
- **Provenance records contain:** caseId, evidenceId, aiRequestId, hashes, status, timing, usage
- **AI attempts:** provider, model, status, duration — never response bodies

## 14. Document Extraction

`AIFactExtractionService` integrates F5 text extraction with F6 AI:

- **Input:** Processed document text + required fact keys from problem module
- **Token budget:** Deterministic truncation (70% head / 30% tail) with explicit marker
- **Source location:** Verified by substring search in actual text; `null` when not found (never fabricated)
- **Candidates:** `relation: PROPOSED` (inferred) or `EXTRACTED` (explicit); `certainty` preserved from model; `location` nullable
- **No auto-confirmation:** Candidates are `UNCONFIRMED` by construction; only user/system confirmation creates Facts

## 15. Tests

### Unit Tests (3 files, ~45 tests)

| File                      | Coverage                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `router.test.ts`          | Capability selection, retries, fallback, provenance, input hash determinism                                              |
| `security.test.ts`        | Injection sanitization, prompt versioning, structured output, cost estimation, input hash                                |
| `fact-extraction.test.ts` | Cases 1–7 (explicit date, no date, ambiguity, contradiction, injection, huge doc, invalid output) + no-auto-confirmation |

### Integration Tests

- `pglite-setup.ts` + `final-verification.test.ts`: Full persistence chain with migration 0006
- All existing F1–F5 tests pass (no regressions)

### Matrix

```
✓ typecheck (tsc --noEmit)
✓ lint (eslint)
✓ format (prettier)
✓ build (next build)
✓ unit tests (vitest)
✓ integration tests (vitest)
✓ E2E not changed (no UI changes)
```

## 16. Technical Debt

| Item                            | Severity | Reason                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H4 flaky timeout (pre-existing) | Medium   | PGlite WASM degrades under CPU contention; default 5000ms borderline in full suite. Isolated: 1700–2000ms (5/5 pass). In suite: 5000–8800ms (3/3 fail when system loaded, 3/3 pass when system idle). **Not caused by F6** (verified: F5 baseline with F6 changes passes 294/294 in clean runs). Fix: increase testTimeout for integration tests or run with `--no-threads`. |
| No streaming support            | Low      | Spec §29: deferred; sync extraction is sufficient for v1                                                                                                                                                                                                                                                                                                                     |
| No embeddings/RAG               | Low      | Spec §29: deterministic truncation is sufficient                                                                                                                                                                                                                                                                                                                             |
| No multi-modal/vision           | Low      | Spec §29: all current tasks are text-only                                                                                                                                                                                                                                                                                                                                    |
| No queue for long AI tasks      | Low      | Spec §29: tasks are short (<30s); queues when needed later                                                                                                                                                                                                                                                                                                                   |
| Pricing table is static         | Low      | Real billing from provider dashboards; table is a planning estimate                                                                                                                                                                                                                                                                                                          |
| `FAKE_USAGE` in tests           | Low      | Test-only; real usage from provider responses                                                                                                                                                                                                                                                                                                                                |

## 17. H4 Flaky Test Investigation

The H4 integration test (`same physical object + same extractor version = idempotent`) fails intermittently in the full test suite. Investigation:

| Metric    | Isolated         | Full Suite (loaded) | Full Suite (idle) |
| --------- | ---------------- | ------------------- | ----------------- |
| Pass rate | 5/5 (100%)       | 0/3 (0%)            | 3/3 (100%)        |
| Duration  | 1700–2000ms      | 5600–8800ms         | 1700–2000ms       |
| Timeout   | 5000ms (default) | 5000ms (default)    | 5000ms (default)  |

**Root cause:** PGlite (WASM Postgres) performance degrades 3–4x under CPU contention when all tests run concurrently. The test does 4 DB operations (create case, add evidence x2, uploadAndProcess x2, loadCase). The 5000ms default Vitest timeout is borderline.

**F6 did not cause this:**

- `vitest.config.ts` unchanged
- Test file only changed: added migration 0006 (schema compatibility) + `location?.` (nullable type fix)
- F6 added no new integration tests
- H4 creates fresh PGlite per test (no shared state)
- F5 baseline with F6 changes passes 294/294 in clean system conditions

**Classification:** KNOWN PRE-EXISTING FLAKY TEST. Not a F6 regression.

## 18. Explicit Limits

1. **AI never confirms facts** — candidates are `UNCONFIRMED` until explicit user/system flow
2. **AI never decides legal outcomes** — Rule Engine is the sole arbiter
3. **AI never modifies rules, sources, or case status** — architectural barrier
4. **AI never invents source locations** — `null` when quote not found in text
5. **AI never fabricates facts** — model output validated by Zod; facts outside required keys are dropped
6. **No tool calling** — AI is stateless, no DB access, no external actions
7. **No autonomous agents** — single-shot requests only
8. **Retry bounded** — max 2 per model, transient only, never infinite loops
9. **Input bounded** — token budget truncation with explicit marker
10. **PII excluded** — logs contain only identifiers and metrics

---

```
PHASE 6 STATUS: APPROVED
```
