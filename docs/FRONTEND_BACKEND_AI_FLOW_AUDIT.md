# FRONTEND ↔ BACKEND AI FLOW FORENSIC AUDIT

## 1. Executive Summary

This audit reveals a **PARTIALLY CONNECTED** architecture. The AI intake flow (SearchBar → /api/intake/interpret → case creation) is properly connected, but the legacy `/case/new` workflow bypasses the canonical backend architecture entirely. The system has two parallel paths that do not share state.

**Critical Finding**: There are TWO independent case creation paths that do not converge.

---

## 2. Actual End-to-End Flow

### Path A: AI Intake (Correct Path)

```
USER INPUT (SearchBar)
  ↓
POST /api/intake/interpret { message }
  ↓
IntakeService.interpretUserMessage()
  ↓
AIRouter → AI Provider → Structured Output
  ↓
routeInterpretation() → Module Candidate
  ↓
CaseService.createCase() → caseId
  ↓
GET /api/cases/{caseId}/intake → nextQuestion
  ↓
Intake Page → Questions → POST /api/intake/confirm
  ↓
GET /api/cases/{caseId}/result → Analysis
```

### Path B: Legacy Form (BROKEN Path)

```
SearchBar → /case/new?problem=cancellation-charge
  ↓
NewCasePage (hardcoded form)
  ↓
Local React state (cancellationDate, chargeDate, amount)
  ↓
POST /api/problems/cancellation-charge/cases { ownerId: "anonymous" }
  ↓
CaseService.createCase() → caseId
  ↓
Redirect to /case/{caseId}
  ↓
No facts confirmed, no analysis
```

**PROBLEM**: Path B creates a case but NEVER confirms any facts. The form data (dates, amounts) is collected in React state but NEVER sent to the backend.

---

## 3. Frontend → API Map

| Frontend           | Action           | API                            | Method     | Status      |
| ------------------ | ---------------- | ------------------------------ | ---------- | ----------- |
| SearchBar (AI)     | Enter query      | /api/intake/interpret          | POST       | CONNECTED   |
| SearchBar (module) | Click result     | /case/new?problem=X            | Navigation | CONNECTED   |
| Intake Page        | Load case        | /api/cases/{id}/intake         | GET        | CONNECTED   |
| Intake Page        | Confirm fact     | /api/intake/confirm            | POST       | CONNECTED   |
| Case Page          | Load result      | /api/cases/{id}/result         | GET        | CONNECTED   |
| Case Page          | Load actions     | /api/cases/{id}/actions        | GET        | CONNECTED   |
| Case Page          | Load timeline    | /api/cases/{id}/timeline       | GET        | CONNECTED   |
| Case Page          | Load comms       | /api/cases/{id}/communications | GET        | CONNECTED   |
| Case Page          | Reanalyze        | /api/cases/{id}/reanalyze      | POST       | CONNECTED   |
| Case Page          | Transition       | /api/cases/{id}/transition     | POST       | CONNECTED   |
| Case Page          | Export TXT       | /api/cases/{id}/export         | GET        | CONNECTED   |
| Case Page          | Export JSON      | /api/cases/{id}/data           | GET        | CONNECTED   |
| Case Page          | Delete           | /api/cases/{id}/delete         | DELETE     | CONNECTED   |
| Research Page      | Start research   | /api/cases/{id}/research       | POST       | CONNECTED   |
| Research Page      | List research    | /api/cases/{id}/research       | GET        | CONNECTED   |
| NewCasePage        | Create case      | /api/problems/{key}/cases      | POST       | **BROKEN**  |
| NewCasePage        | Upload evidence  | (none)                         | -          | **MISSING** |
| NewCasePage        | Confirm facts    | (none)                         | -          | **MISSING** |
| NewCasePage        | Trigger analysis | (none)                         | -          | **MISSING** |

---

## 4. AI Intake Flow — Detailed Trace

### User enters: "Me han cobrado una penalización después de cancelar"

**Step 1**: SearchBar.tsx

- Input: `query = "Me han cobrado una penalización después de cancelar"`
- Action: `handleSelect({ kind: "ai", label: "Analizar con IA" })`
- Calls: `fetch("/api/intake/interpret", { method: "POST", body: { message: query } })`

**Step 2**: /api/intake/interpret/route.ts

- Validates: `z.string().min(10).max(5000)`
- Budget check: `tryReserveBudget(budgetKey)`
- Calls: `services.intakeService.interpretUserMessage(message, options)`

**Step 3**: IntakeService.interpretUserMessage()

- Sanitizes text (prompt injection defense)
- Builds catalogue from registered modules
- Calls: `this.router.run({ task: "PROBLEM_INTERPRETATION", ... })`
- AI returns: `IntakeInterpretationOutput` (validated by Zod)

**Step 4**: Routing

- Calls: `services.intakeService.routeInterpretation(interpretation)`
- Returns: `{ status: "ROUTED", moduleCandidate: { problemKey: "cancellation-charge" } }`

**Step 5**: Case Creation

- Calls: `services.caseService.createCase({ problemSlug: "unknown", jurisdiction: "UNKNOWN", ... })`
- Returns: `caseId`

**Step 6**: Response

```json
{
  "caseId": "abc-123",
  "interpretation": { "summary": "...", "candidateModules": [...], "factCandidates": [...] },
  "routing": { "status": "ROUTED", "moduleKey": "cancellation-charge" },
  "nextQuestion": { "factKey": "cancellation_date", "questionText": "..." }
}
```

**Step 7**: Frontend Navigation

- `window.location.href = "/case/abc-123/intake"`

### VERDICT: PROPERLY CONNECTED ✅

---

## 5. Confirmation Flow — Detailed Trace

**Intake Page loads**:

- `GET /api/cases/{caseId}/intake`
- Returns: `confirmedFacts`, `nextQuestion`, `allRequiredConfirmed`

**User answers question**:

- Input: `answer = "15 de marzo"`
- Calls: `POST /api/intake/confirm`
- Body: `{ caseId, candidateId, factKey: "cancellation_date", decision: "confirm", value: { type: "date", value: "2025-03-15" } }`

**Backend**:

- Validates factKey belongs to module
- Calls: `services.caseService.confirmFactForCase(caseId, { key, value })`
- Returns: `{ success: true, contradictionDetected: false }`

**Frontend reloads**:

- `GET /api/cases/{caseId}/intake`
- Gets next question

### VERDICT: PROPERLY CONNECTED ✅

---

## 6. Case Creation Flow — THE CRITICAL BUG

### Path A (AI Intake): WORKS ✅

```typescript
// SearchBar → /api/intake/interpret → creates case with jurisdiction="UNKNOWN"
// Later, intake flow confirms facts including jurisdiction
```

### Path B (Legacy Form): BROKEN ❌

```typescript
// /case/new/page.tsx → handleSubmit()
const createRes = await fetch("/api/problems/cancellation-charge/cases", {
  method: "POST",
  body: JSON.stringify({ ownerId: "anonymous" }),
});
// PROBLEM: React state (cancellationDate, chargeDate, amount) is NEVER sent
// PROBLEM: No facts are confirmed
// PROBLEM: Case is created but has zero useful data
```

**The form collects**:

- `cancellationDate`
- `chargeDate`
- `chargeAmount`
- `hasConfirmation`
- `hasCommitment`

**But sends only**:

```json
{ "ownerId": "anonymous" }
```

**Result**: Case created with no facts, no analysis possible.

---

## 7. Evidence Flow

### Current State: NOT CONNECTED

**Frontend** (NewCasePage):

- Has file input UI
- `console.log("Files selected:", ...)` on file selection
- NEVER uploads to backend

**Frontend** (Intake Page):

- No evidence upload UI

**Backend**:

- EvidenceService exists (src/core/evidence/service.ts)
- Evidence upload API exists? **NO dedicated upload endpoint found**
- R2 storage exists (src/server/adapters/storage/r2-object-storage.ts)

### VERDICT: EVIDENCE FLOW MISSING ❌

---

## 8. Analysis Flow

### How Analysis Actually Works

**When**: `GET /api/cases/{caseId}/result` is called

**What happens**:

```typescript
// result/route.ts
const analysis = await services.analysisService.runProblemAnalysis(caseId);
const result = buildResult({ facts, evaluations, ... });
return NextResponse.json({ result });
```

**Key insight**: Analysis runs ON EVERY REQUEST to /result. It is NOT triggered by a specific "analyze" button. It is computed fresh from confirmed facts.

### Frontend Trigger

**Case Page** (`/case/[caseId]/page.tsx`):

- `useEffect` calls `loadData(id)`
- `loadData` calls `fetch(/api/cases/${id}/result)`
- This triggers real-time analysis

**Intake Complete Flow**:

- When `allRequiredConfirmed === true`
- Intake Page shows "Ver resultado" button
- Links to `/case/{caseId}`
- Case Page loads and triggers analysis

### VERDICT: PROPERLY CONNECTED ✅

---

## 9. Research Resolver Flow

### Manual Research (Working)

```
Research Page → POST /api/cases/{id}/research
  ↓
ResearchService.startResearch()
  ↓
AI-powered research
  ↓
Persist findings, sources, conflicts
  ↓
GET /api/cases/{id}/research → Display results
```

### Automatic Research (NOT CONNECTED)

The architecture intends:

```
Unsupported problem → Research Resolver → automatically
```

But currently:

- Research must be manually triggered from the Research tab
- No automatic routing to research for unsupported problems
- The intake flow shows "no module found" but does not offer research

### VERDICT: PARTIAL ⚠️

---

## 10. Jurisdiction Flow

### Where Jurisdiction Comes From

**Path A (AI Intake)**:

```typescript
// /api/intake/interpret/route.ts
const created = await services.caseService.createCase({
  problemSlug: "unknown",
  jurisdiction: "UNKNOWN", // ← Default
  locale: "es-ES",
  currency: "EUR",
});
// Later: jurisdiction hints from AI, user confirmation in intake
```

**Path B (Legacy)**:

```typescript
// /api/problems/[problemKey]/cases/route.ts
const created = await services.caseService.createCase({
  problemSlug: problemKey,
  jurisdiction: "ES", // ← HARDCODED SPAIN
  locale: "es-ES",
  currency: "EUR",
});
```

### CRITICAL FINDING

The legacy demo API (`/api/problems/[problemKey]/cases`) HARDCODES `jurisdiction: "ES"`.

This API is called by `/case/new/page.tsx` which is linked from:

1. SearchBar when clicking a module result
2. Problem detail pages "Comenzar análisis" button

### VERDICT: JURISDICTION HARDCODED IN LEGACY PATH ❌

---

## 11. State Management

### State Map

| State           | Owner       | Lifetime  | Source of Truth  | Can Diverge?   |
| --------------- | ----------- | --------- | ---------------- | -------------- |
| query           | SearchBar   | Component | Local state      | No             |
| isLoading       | SearchBar   | Component | Local state      | No             |
| caseId (intake) | IntakePage  | Component | URL params       | No             |
| phase           | IntakePage  | Component | Derived from API | Could be stale |
| answer          | IntakePage  | Component | Local state      | No             |
| form data       | NewCasePage | Component | Local state      | **YES**        |
| caseId (new)    | NewCasePage | Component | API response     | No             |
| result          | CasePage    | Component | API response     | Could be stale |
| timeline        | CasePage    | Component | API response     | Could be stale |

### Critical Divergence

**NewCasePage form state** vs **Backend case facts**:

```
Frontend state: { cancellationDate: "2025-03-15", chargeAmount: "80" }
Backend state: { facts: [] }  ← EMPTY
```

The frontend has data that the backend never received.

---

## 12. Error Handling

### Backend Error Codes

| Code                | HTTP | Meaning                  |
| ------------------- | ---- | ------------------------ |
| INVALID_INPUT       | 400  | Bad request              |
| NOT_FOUND           | 404  | Case/module not found    |
| CONCURRENT_UPDATE   | 409  | Optimistic lock conflict |
| CASE_CREATE_FAILED  | 500  | DB error during creation |
| BUDGET_EXCEEDED     | 429  | AI call limit            |
| AI_UNAVAILABLE      | 503  | AI provider down         |
| SERVICE_UNAVAILABLE | 503  | DB not configured        |
| ANALYSIS_FAILED     | 500  | Rule engine error        |

### Frontend Error Handling

**Intake Page**: ✅ Handles 409, 404, 500 with user messages
**Case Page**: ⚠️ Generic "Error loading case"
**NewCasePage**: ⚠️ "No se pudo crear el caso" — no detail
**SearchBar**: ❌ Silently redirects on error

---

## 13. Duplicated Business Logic

| File                    | Logic                              | Canonical Backend              | Risk                        |
| ----------------------- | ---------------------------------- | ------------------------------ | --------------------------- |
| problema-libre/page.tsx | `detectMatch()` keyword matching   | IntakeService.moduleCandidate  | LOW (simple fallback)       |
| intake/page.tsx         | `buildValueInput()` type inference | Backend validation             | MEDIUM (type mismatch risk) |
| case/new/page.tsx       | Entire form state management       | CaseService.confirmFactForCase | HIGH (data never sent)      |

---

## 14. Disconnected Flows

### FLOW-001: Legacy Case Creation

- **Name**: /case/new form workflow
- **Frontend**: Collects dates, amount, confirmation
- **Backend**: Creates case with NO facts
- **Problem**: Form data is lost
- **Severity**: CRITICAL
- **Fix**: Remove or connect to IntakeService

### FLOW-002: Evidence Upload

- **Name**: File upload in case creation
- **Frontend**: File input exists, logs to console
- **Backend**: No upload endpoint called
- **Problem**: Files never reach backend
- **Severity**: HIGH
- **Fix**: Implement upload endpoint or remove UI

### FLOW-003: Automatic Research Routing

- **Name**: Unsupported problem → Research
- **Frontend**: Shows "no module found"
- **Backend**: Research available but not triggered
- **Problem**: User must manually navigate to Research tab
- **Severity**: MEDIUM
- **Fix**: Auto-suggest research for unsupported problems

### FLOW-004: Intake Interpretation Display

- **Name**: AI interpretation results
- **Frontend**: Redirects immediately to intake page
- **Backend**: Returns full interpretation with candidates
- **Problem**: User never sees what AI understood
- **Severity**: MEDIUM
- **Fix**: Show interpretation before redirecting

---

## 15. Critical Bugs

### BUG-001: Legacy Form Data Loss

- **Location**: src/app/case/new/page.tsx
- **Issue**: Form collects data but only sends ownerId
- **Impact**: Cases created without useful facts
- **Severity**: CRITICAL

### BUG-002: Hardcoded ES Jurisdiction

- **Location**: src/app/api/problems/[problemKey]/cases/route.ts
- **Issue**: `jurisdiction: "ES"` hardcoded
- **Impact**: Non-ES cases get wrong jurisdiction
- **Severity**: HIGH

### BUG-003: SearchBar Error Handling

- **Location**: src/components/SearchBar.tsx
- **Issue**: On API error, redirects to /problema-libre
- **Impact**: User sees "no automated flow" instead of error
- **Severity**: MEDIUM

---

## 16. Target Frontend ↔ Backend Architecture

### Frontend Responsibility (Should Be)

```
- Collect user input
- Display AI interpretation
- Confirm/reject facts
- Show questions
- Display results
- Show loading states
- Handle errors
- Navigate between states
```

### Backend Responsibility (Should Be)

```
- AI interpretation
- Problem classification
- Fact normalization
- Jurisdiction resolution
- Case state management
- Fact confirmation
- Rule evaluation
- Research
- Analysis
- Result generation
- Action derivation
- Document generation
- Persistence
```

### Shared Contracts

```typescript
// Intake Interpretation (AI → Frontend)
IntakeInterpretation {
  summary: string
  candidateModules: ModuleCandidate[]
  factCandidates: FactCandidate[]
  missingInformation: MissingInfo[]
  jurisdictionHints: JurisdictionHint[]
}

// Routing Decision (Backend → Frontend)
RoutingDecision {
  status: "ROUTED" | "UNROUTED"
  moduleKey?: string
  userExplanation: string
}

// Question (Backend → Frontend)
Question {
  factKey: string
  questionText: string
  remainingCount: number
}

// Fact Confirmation (Frontend → Backend)
ConfirmRequest {
  caseId: string
  factKey: string
  value: FactValue
}
```

---

## 17. Required Changes

1. **Remove or fix /case/new** — Either connect form data to backend or redirect to AI intake
2. **Fix legacy jurisdiction** — Remove hardcoded "ES" from demo API
3. **Add evidence upload endpoint** — Connect file selection to backend storage
4. **Show AI interpretation** — Display results before redirecting to intake
5. **Improve error handling** — Show specific error messages
6. **Auto-suggest research** — For unsupported problems

---

## 18. Recommended Implementation Order

1. Fix critical data loss (BUG-001)
2. Fix jurisdiction hardcoding (BUG-002)
3. Connect evidence upload (FLOW-002)
4. Show AI interpretation (FLOW-004)
5. Improve error handling (BUG-003)
6. Auto-suggest research (FLOW-003)

---

# FINAL AUDIT SUMMARY

```
FRONTEND ↔ BACKEND AI FLOW AUDIT

Current integration:
PARTIAL

AI intake:
CONNECTED

Problem routing:
CONNECTED

Case creation:
PARTIAL (two paths, one broken)

Evidence:
DISCONNECTED

Analysis:
CONNECTED

Research Resolver:
PARTIAL (manual only)

Jurisdiction:
PARTIAL (hardcoded in legacy)

Result Engine:
CONNECTED

Critical issues:
1 (data loss in legacy form)

High issues:
1 (hardcoded jurisdiction)

Medium issues:
2 (error handling, interpretation display)

Low issues:
0

Code changes:
0

Implementation:
NOT PERFORMED
```
