# F16 — PRODUCT & BUSINESS MODEL — FINAL REPORT

## Executive Summary

F16 audited Resolveo from a product and business perspective to determine commercial readiness.

**Key Finding: Resolveo should launch as a FREE product.** Monetization is NOT YET JUSTIFIED.

Rationale:

1. Core value proposition must remain free (trust, mission, acquisition)
2. Consumer problems are infrequent (1-2 per year) — subscriptions don't fit
3. Users don't know value until after analysis — pay-per-case creates friction
4. Free tier validates product before committing to business model
5. Costs are low (~$0.01-0.05 per user) — sustainable without revenue initially

---

## 1. Product Definition

### What Resolveo Does

Resolveo helps consumers understand their legal position and take action:

| Capability            | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| Problem Understanding | User describes problem in natural language                    |
| Fact Extraction       | System identifies key facts from description + documents      |
| Rule Analysis         | Deterministic engine evaluates against verified legal sources |
| Result Production     | Structured analysis with traceable claims                     |
| Document Generation   | Formal complaints/reclamations ready to send                  |
| Case Management       | Timeline, communications, reanalysis                          |

### What Makes It Different

- **Not a chatbot** — AI is internal tool, not product interface
- **Deterministic rules** — Legal conclusions from verified sources, not AI generation
- **Traceable** — Every claim links to facts and sources
- **Honest** — Missing information marked, not invented
- **Jurisdiction-aware** — Rules scoped to specific legal systems

### Current Capabilities (Implemented)

| Feature                      | Status       |
| ---------------------------- | ------------ |
| Universal Problem Intake     | ✅ F8.3      |
| 4 Deterministic Modules (ES) | ✅ F8.1-F8.4 |
| Research Resolver            | ✅ F14       |
| Document Generation          | ✅ F12       |
| Case Management              | ✅ F13       |
| Multi-Jurisdiction           | ✅ F15       |
| Privacy Controls             | ✅ F16 (new) |
| Case Deletion                | ✅ F16 (new) |
| Data Export                  | ✅ F16 (new) |

---

## 2. Target User

### Primary: Spanish Consumer with a Problem

- **Who**: Regular consumer (not a lawyer)
- **When**: After consumer issue (cancellation charge, non-delivery, warranty, flight)
- **Need**: Understand rights, get help writing formal complaint
- **Technical skill**: Basic web user
- **Language**: Spanish (primary)

### User Pain Points

1. "I don't know if I have rights"
2. "I don't know what law applies"
3. "I don't know how to write a formal complaint"
4. "I've been told different things"
5. "I don't want to pay a lawyer for a simple issue"

---

## 3. User Journey (Current)

```
LANDING PAGE
    ↓
SearchBar / Select Problem
    ↓
Intake: Describe problem + jurisdiction
    ↓
AI Interpretation → Extract facts
    ↓
User confirms facts
    ↓
Deterministic Analysis (ES) OR Research (other)
    ↓
Result: Claims, Actions, Sources
    ↓
Optional: Generate Document
    ↓
Download TXT
    ↓
Case stored (anonymous)
```

### Friction Points Identified

1. **No case recovery** — Close browser = lose case
2. **No persistent access** — Anonymous only
3. **TXT only** — No PDF/DOCX
4. **No email delivery** — Manual download
5. **Limited mobile** — Functional but not polished
6. **No "what next" guidance** — After document, user is alone

---

## 4. Cost Structure

### Variable Costs (Per Case)

| Component            | Provider   | Cost              |
| -------------------- | ---------- | ----------------- |
| AI Interpretation    | Groq       | ~$0.001           |
| AI Fact Extraction   | Groq       | ~$0.001           |
| AI Document Draft    | Groq       | ~$0.002           |
| Research (if needed) | Groq + Web | ~$0.01            |
| **Total AI/case**    |            | **~$0.005-0.015** |

### Fixed Costs (Monthly)

| Component       | Provider | Cost      |
| --------------- | -------- | --------- |
| Database        | Neon     | $0-25     |
| Storage         | R2       | $0-5      |
| Hosting         | Vercel   | $0-20     |
| **Total fixed** |          | **$0-50** |

### Cost Per User

- Average: 1-2 cases
- AI cost: ~$0.01-0.03
- Storage: negligible
- **Total: ~$0.01-0.05/user**

---

## 5. Business Model Analysis

### Models Evaluated

| Model           | Verdict            | Rationale                                |
| --------------- | ------------------ | ---------------------------------------- |
| **A: Free**     | ✅ RECOMMENDED     | Maximizes adoption, builds trust, simple |
| B: Freemium     | ⏸️ DEFER           | Validate free first, then evaluate       |
| C: Pay-per-case | ❌ NOT RECOMMENDED | Friction at worst moment, trust issues   |
| D: Subscription | ❌ NOT RECOMMENDED | Infrequent use doesn't justify monthly   |
| E: Credits      | ❌ NOT RECOMMENDED | Complex, confusing                       |
| F: B2B          | ⏸️ POSSIBLE FUTURE | Separate product essentially             |
| G: Hybrid       | ⏸️ POSSIBLE V2     | After validating free tier               |

### Decision: Free V1

**Resolveo launches FREE.**

Why:

1. **Trust** — Paywalling basic understanding erodes trust
2. **Mission** — Consumer rights info should be accessible
3. **Acquisition** — Free drives word-of-mouth
4. **Learning** — Validate before committing to business model
5. **Costs** — Low enough to sustain without revenue initially

---

## 6. What Remains Free (Forever)

Core value proposition:

- Problem understanding
- Fact extraction
- Rule analysis
- Basic result display
- Case storage

### Why Free Forever

1. Trust foundation
2. Consumer rights mission
3. Acquisition channel
4. Legal considerations

---

## 7. What Could Become Paid (V2, If Justified)

| Feature           | Rationale               | Est. Price    |
| ----------------- | ----------------------- | ------------- |
| PDF/DOCX export   | Professional formatting | €1-3/doc      |
| Extended research | Deep source analysis    | €2-5/research |
| Case history      | Persistent storage      | €1-2/month    |
| Multiple cases    | Power users             | €5-10/month   |
| Priority support  | Faster response         | €10-20/month  |

---

## 8. Authentication

### Current State

- No authentication
- CaseId only credential
- Cases anonymous

### When Needed

- Case recovery
- Multiple devices
- Paid features
- Case history

### Recommendation: DEFER until needed

- Magic links (no passwords)
- Simple implementation

---

## 9. Entitlement Architecture (When Needed)

### Generic Model (Not Hardcoded)

```typescript
interface Entitlement {
  feature: string;
  limit?: number;
  used: number;
  status: "ACTIVE" | "LIMIT_REACHED" | "EXPIRED";
}
```

### Key Principle

**Entitlements control access, NOT legal correctness.**

Free and paid users get same legal analysis.

---

## 10. Privacy (Implemented in F16)

### New Endpoints

| Endpoint                     | Method | Purpose                         |
| ---------------------------- | ------ | ------------------------------- |
| `/api/cases/[caseId]/delete` | DELETE | GDPR Art. 17 - Right to erasure |
| `/api/cases/[caseId]/data`   | GET    | GDPR Art. 20 - Data portability |

### UI Updates

- Case page now shows "Export data (JSON)" button
- Case page now shows "Delete case" button with confirmation

---

## 11. Implementation (F16)

### New Files

1. `docs/PHASE_16_PRODUCT_BUSINESS_MODEL.md` — Business model analysis
2. `src/app/api/cases/[caseId]/delete/route.ts` — Case deletion endpoint
3. `src/app/api/cases/[caseId]/data/route.ts` — Case data export endpoint
4. `docs/PHASE_16_PRODUCT_BUSINESS_MODEL_FINAL_REPORT.md` — This report

### Modified Files

1. `src/app/case/[caseId]/page.tsx` — Added export/delete buttons

---

## 12. Validation

### Test Results

```
Tests:      971/971 PASS
Typecheck:  PASS
Lint:       PASS
Build:      PASS
```

### Project Contamination Check

**Result: CLEAN** — No references to unrelated projects (Genius, etc.)

---

## 13. Remaining Debt

1. **PDF/DOCX export** — Currently TXT only
2. **Case recovery** — No authentication yet
3. **Mobile optimization** — Functional but not polished
4. **Analytics** — No product analytics yet
5. **Email delivery** — No email notifications

---

## 14. Recommended Next Phase

### F17: User Experience & Polish

Focus areas:

1. PDF export
2. Mobile optimization
3. Onboarding improvements
4. Error message improvements
5. Basic analytics (privacy-preserving)

---

## 15. Final Verdict

```
APPROVED
```

### Rationale

1. ✅ Product architecture is coherent
2. ✅ No unjustified monetization introduced
3. ✅ Domain logic independent from commercial logic
4. ✅ Privacy controls implemented (GDPR)
5. ✅ Security intact
6. ✅ Tests pass (971/971)
7. ✅ Typecheck passes
8. ✅ Lint passes
9. ✅ Build passes
10. ✅ No cross-project contamination

### Key Decision

**Resolveo is a FREE product.** Monetization deferred until:

- 1000+ cases created
- Clear usage patterns emerge
- Users request paid features
- Cost becomes unsustainable

---

_Report generated: 2026-09-21_
_F16 Status: APPROVED_
_Decision: Free V1, defer commercial architecture_
