# F10 — PRODUCTION HARDENING & SECURITY — FINAL REPORT

## 1. Executive Summary

Resolveo went through a systematic security audit covering all API routes, domain invariants, AI security, upload validation, error handling, input validation, and dependency health. The existing architecture (F1–F9) already had strong security foundations — no CRITICAL vulnerabilities were found in the application code itself. Two meaningful improvements were implemented: server-side input validation for caseId at API boundaries, and error message sanitization to prevent information leakage. One HIGH severity dependency vulnerability (drizzle-orm SQL injection) was patched by upgrading to 0.45.2.

## 2. Threat Model

```
Anonymous user
      │
      ├── public pages (SEO, /problemas, /como-funciona...)
      ├── /api/intake/interpret (AI interpretation, costs money)
      ├── /api/intake/confirm (fact confirmation, mutates state)
      ├── /api/cases/:caseId/result (reads case data)
      ├── /api/cases/:caseId/actions (reads case data)
      ├── /api/cases/:caseId/intake (reads/writes case data)
      ├── /api/cases/:caseId/export (exports case data)
      └── /api/problems/:key/cases (creates cases)
             │
             ▼
        Resolveo
             │
      ┌──────┼────────┐
      ↓      ↓        ↓
    DB     Storage     AI
  (Neon)    (R2)    (Groq/OpenAI/Gemini)
```

**Key threat categories analyzed:**
- IDOR / case access across users
- ID enumeration / brute force
- Prompt injection via user text or documents
- AI cost abuse (unlimited token consumption)
- File upload abuse (MIME spoofing, oversized files, path traversal)
- Error information leakage
- PII exposure in logs / metadata
- Cache poisoning of private data
- Race conditions / double confirmation
- Dependency vulnerabilities

## 3. Initial Audit

### What was already strong (no changes needed)

| Area | Finding |
|------|---------|
| **Fact provenance** | `createFact()` enforces: CONFIRMED only from USER_PROVIDED/USER_RESOLVED. AI cannot auto-confirm facts. ✅ |
| **Optimistic locking** | `CaseService.saveUnit()` checks `case.version` — concurrent updates cause `CONCURRENT_UPDATE` error. ✅ |
| **Input validation** | All API routes use Zod schemas. `.strict()` rejects unknown fields. ✅ |
| **AI output validation** | `parseStructuredOutput()` validates against Zod schema before domain use. ✅ |
| **Prompt injection defense** | `sanitizeUntrustedText()` strips injection patterns + zero-width chars. `assembleUserMessage()` wraps content in `<untrusted_document>` delimiters. System prompt forbids obeying instructions inside delimiters. ✅ |
| **AI budget enforcement** | `MAX_INTERPRETATION_CALLS = 3` per case, enforced server-side. Client cannot send or reset count. ✅ |
| **Upload validation** | MIME magic bytes, file size limits, filename sanitization, double extension checks, storage key generation from UUID (never user filename). ✅ |
| **Security headers** | X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy, Permissions-Policy, HSTS in production. ✅ |
| **Secret isolation** | All env vars validated via Zod. API keys only in server env (`src/lib/env.ts`). No `NEXT_PUBLIC_*` for secrets. `.gitignore` correct. ✅ |
| **Logging** | Structured logger with secret key redaction. No raw `console.log` of request bodies. ✅ |
| **Error handling** | Typed error taxonomy (`DomainError`, `AIError`). No stack traces returned to client. ✅ |
| **Private route protection** | `/case/*` has noindex+noarchive+nosnippet via layout metadata. robots.txt disallows `/case/`, `/api/`, `/casos/`. ✅ |

## 4. Findings

| ID | Severity | Area | Finding | Status |
|----|----------|------|---------|--------|
| F1 | **HIGH** | Dependency | drizzle-orm 0.44.7 has SQL injection via improperly escaped identifiers (CVE-2026-39356) | **FIXED** — upgraded to 0.45.2 |
| F2 | **MEDIUM** | Input Validation | No caseId format validation in API routes — malformed IDs could reach domain layer before being caught by DB | **FIXED** — `isValidCaseId()` added |
| F3 | **MEDIUM** | Error Handling | `error.message` directly returned in some catch blocks — could leak filesystem paths or internal details | **FIXED** — `sanitizeErrorMessage()` |
| F4 | **MEDIUM** | Caching | Private API routes (`/api/cases/:id/*`) had no Cache-Control headers — CDN/browser could cache case data | **FIXED** — `Cache-Control: private, no-store` |
| F5 | **MEDIUM** | Input Validation | No problemKey format validation in `/api/problems/:key/cases` — could accept arbitrary strings | **FIXED** — `isValidProblemKey()` |
| F6 | **LOW** | Budget Store | In-memory Map — not distributed across server instances | **DEFERRED** to F11 |
| F7 | **LOW** | Auth | No user authentication — caseId is the only access credential | **DEFERRED** to F11 |
| F8 | **INFO** | Dev Dependencies | handlebars, postcss, esbuild, vitest have known vulnerabilities — all dev-only, not in production bundle | No action needed |

## 5. Security Fixes

### F1: drizzle-orm upgrade (0.44.7 → 0.45.2)
- Patched CVE-2026-39356: SQL injection via improperly escaped identifiers
- No breaking changes in the subset of drizzle APIs used by the project
- Verified: typecheck, lint, build, all 662 tests pass

### F2: caseId validation
- Created `src/lib/validation.ts` with `isValidCaseId()`
- Applied to all 5 case-scoped API routes (result, actions, intake GET/POST, export, confirm)
- Format: alphanumeric + hyphens only, 1-128 chars, blocks `/.`, control chars, path traversal

### F3: Error message sanitization
- Created `sanitizeErrorMessage()` in `src/lib/validation.ts`
- Applied to all catch blocks in API routes
- Blocks: secrets patterns, filesystem paths, stack traces, long messages

### F4: Cache-Control for private routes
- Added `Cache-Control: private, no-store, no-cache, must-revalidate` + `Pragma: no-cache` to:
  - `/api/cases/:id/result` (GET)
  - `/api/cases/:id/actions` (GET)
  - `/api/cases/:id/intake` (GET, POST)
  - `/api/cases/:id/export` (GET)

### F5: problemKey validation
- Added `isValidProblemKey()` — lowercase alphanumeric + hyphens, max 64 chars
- Applied to `/api/problems/:key/cases` POST

## 6. Access Control

**Endpoints reviewed:**
- `GET /api/cases/:caseId/result` — reads case + runs analysis
- `GET /api/cases/:caseId/actions` — reads case + derives actions
- `GET/POST /api/cases/:caseId/intake` — reads/writes case facts
- `GET /api/cases/:caseId/export` — exports case data
- `POST /api/intake/confirm` — confirms facts on a case
- `POST /api/intake/interpret` — creates new case or reinterprets
- `POST /api/problems/:problemKey/cases` — creates new case

**Current access model:** CaseId is the only credential. No user authentication exists. This means:
- Anyone who knows a caseId can read/modify the case
- CaseIds are UUIDs (128-bit entropy) — infeasible to enumerate
- This is an acceptable limitation for an anonymous consumer tool, documented for F11

## 7. Upload Security

**Controls verified (F5 — already implemented):**
- MIME validation via magic bytes (PDF, JPEG, PNG, WEBP)
- File size limits enforced server-side
- Filename sanitization (path traversal, double extensions, control chars)
- Storage keys generated from UUID (never user-provided filenames)
- Duplicate detection via SHA-256 checksum
- Processing lifecycle: PENDING → PROCESSING → COMPLETED/FAILED

No upload endpoints were modified in F10.

## 8. AI Security

**Controls verified (F6/F8.3 — already implemented):**
- Prompt injection defense: `sanitizeUntrustedText()` strips injection patterns
- Content wrapping: `<untrusted_document>` delimiters
- System prompt explicitly forbids obeying instructions inside delimiters
- AI output validated with Zod strict schema (rejects unknown fields)
- AI fact candidates always UNCONFIRMED — only user confirmation creates CONFIRMED facts
- Budget: MAX 3 interpretation calls per case, server-side enforcement
- AI router: typed error taxonomy, no raw SDK errors to client
- AI prompts: immutable versioning with SHA-256 content hashes

No AI security changes were needed in F10.

## 9. Privacy / PII

- Structured logger with secret key redaction — no raw request body logging
- No PII in sitemap, metadata, or public pages
- Case pages: noindex + noarchive + nosnippet
- No caseId in public metadata or structured data
- AI prompts treat user content as data, not instructions

## 10. Rate Limiting / Abuse

**Current state:**
- AI budget: MAX 3 calls per case (in-memory Map)
- Case creation: no rate limit beyond budget
- Uploads: file size limits only

**Limitations (all deferred to F11):**
- No per-IP rate limiting on case creation
- No per-IP rate limiting on AI interpretation
- Budget is in-memory — doesn't persist across server restarts or scale to multiple instances
- No CAPTCHA or bot detection

**Risk assessment:** LOW for current usage. Anonymous consumer tool with no billing. AI budget provides basic abuse prevention per-case.

## 11. Concurrency / Idempotency

**Verified:**
- `CaseService.saveUnit()` uses optimistic locking via `case.version`
- Concurrent modifications return `CONCURRENT_UPDATE` (409)
- `confirmFactForCase()` is idempotent for same key+value (no-op)
- AI budget: `tryReserveBudget()` + `releaseBudget()` on failure prevents double-counting
- Document uploads: duplicate detection via SHA-256 checksum

## 12. Headers / HTTP Security

| Header | Value | Status |
|--------|-------|--------|
| X-Content-Type-Options | nosniff | ✅ |
| X-Frame-Options | DENY | ✅ |
| Referrer-Policy | strict-origin-when-cross-origin | ✅ |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | ✅ |
| Strict-Transport-Security | max-age=63072000; includeSubDomains (production only) | ✅ |
| Cache-Control (private routes) | private, no-store, no-cache, must-revalidate | ✅ NEW |
| Content-Security-Policy | Not implemented — deferred (needs nonce strategy for inline scripts) | DEFERRED |

## 13. Secrets

- All env vars validated via Zod in `src/lib/env.ts`
- API keys only in server-side env (never `NEXT_PUBLIC_*`)
- `.env`, `.env.local`, `.env.*.local`, `.env.production`, `.env.development` all in `.gitignore`
- Logger redacts keys matching `/key|secret|token|password|authorization|cookie/i`
- No hardcoded secrets found in codebase

## 14. Dependencies

**Runtime dependency upgrade:**
- `drizzle-orm`: 0.44.7 → 0.45.2 (CVE-2026-39356 fix)

**Remaining dev-only vulnerabilities (not exploitable in production):**

| Package | Severity | Type | Notes |
|---------|----------|------|-------|
| handlebars | HIGH | devDep (eslint-plugin-boundaries) | Build-time only, not in production bundle |
| postcss | MODERATE | devDep (via next) | Build-time only |
| esbuild | HIGH | devDep (via drizzle-kit) | Build-time only |
| vitest/@vitest/mocker | MODERATE | devDep | Test-only |

## 15. F11 Deferred Items

The following items require F11 infrastructure and are explicitly deferred:

| Item | Risk Level | Why Deferred |
|------|-----------|--------------|
| **budget-store in-memory** | LOW | Sufficient for single-server; persists per-session. Requires Redis/DB for distributed. |
| **distributed rate limiting** | MEDIUM | Requires Redis or similar. Not critical for current single-server deployment. |
| **persistent idempotency** | LOW | Current in-memory is sufficient for single-server. DB-backed needed for scale. |
| **user authentication** | MEDIUM | CaseId-only access is acceptable for anonymous tool. Magic links / auth needed for user accounts. |
| **Content-Security-Policy** | LOW | Requires nonce strategy for Next.js inline scripts. Complex to implement without breaking pages. |
| **Data retention/deletion policy** | LOW | Requires DB persistence (F11) before policy can be enforced. |

## 16. Tests

```
unit:          662 (33 test files)
  - security/hardening.test.ts: 28 tests (NEW)
  - api/intake-api.test.ts: existing (passing)
  - ai/security.test.ts: existing (passing)
  - seo/seo.test.ts: 38 tests (from F9)
  - problems, core, search, etc: existing (passing)
integration:   existing
e2e:           existing
total:         662 unit + integration + e2e
```

## 17. Validation

```
typecheck:     PASS
lint:          PASS (1 pre-existing warning — font loading in layout)
build:         PASS
tests:         662/662 — 0 regressions
dependency:    drizzle-orm upgraded (HIGH CVE fixed)
               16 remaining vulns all in dev dependencies
```

## 18. Files Changed

| File | Change |
|------|--------|
| `src/lib/validation.ts` | NEW — `isValidCaseId`, `isValidProblemKey`, `isValidFactKey`, `sanitizeErrorMessage` |
| `tests/unit/security/hardening.test.ts` | NEW — 28 security regression tests |
| `src/app/api/cases/[caseId]/result/route.ts` | caseId validation + sanitizeErrorMessage + Cache-Control headers |
| `src/app/api/cases/[caseId]/actions/route.ts` | caseId validation + sanitizeErrorMessage + Cache-Control headers |
| `src/app/api/cases/[caseId]/export/route.ts` | caseId validation + sanitizeErrorMessage + Cache-Control headers |
| `src/app/api/cases/[caseId]/intake/route.ts` | caseId validation + sanitizeErrorMessage + Cache-Control headers |
| `src/app/api/intake/confirm/route.ts` | caseId validation + sanitizeErrorMessage |
| `src/app/api/problems/[problemKey]/cases/route.ts` | problemKey validation + sanitizeErrorMessage |
| `package.json` | drizzle-orm 0.44.7 → 0.45.2 |

## 19. Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| No user authentication — caseId is sole access credential | MEDIUM | UUID entropy (128-bit) makes enumeration infeasible. Documented for F11. |
| Budget store is in-memory | LOW | Sufficient for single-server. Per-case limit (3) bounds abuse. |
| No per-IP rate limiting | LOW | Current usage doesn't warrant it. AI budget + case budget provide bounds. |
| Dev dependency vulnerabilities | INFO | Not in production bundle. Low priority to address. |

## 20. Final Status

```
APPROVED
```

No CRITICAL or HIGH findings remain in application code. The drizzle-orm HIGH was patched. All other findings are documented with explicit risk assessments and F11 deferral paths. The system is objectively more production-ready than before F10.
