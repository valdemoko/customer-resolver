# F16 — PRODUCT & BUSINESS MODEL ANALYSIS

## Executive Summary

Resolveo is a **consumer problem resolution platform** that helps users understand their legal position, provides traceable sources, and generates actionable documents.

After comprehensive audit, the conclusion is:

**NOT YET JUSTIFIED for monetization.** The product should launch as a free tool first to validate the core value proposition, understand usage patterns, and build trust. Commercial architecture should be deferred until there is evidence of sustained usage and clear monetization triggers.

---

## 1. Product Definition

### What Resolveo Does

Resolveo helps users resolve consumer disputes by:

1. **Understanding the problem** — User describes their situation in natural language
2. **Extracting facts** — System identifies key facts from description + documents
3. **Applying rules** — Deterministic rule engine evaluates against verified legal sources
4. **Producing results** — Structured analysis with traceable claims
5. **Generating documents** — Formal complaints/reclamations ready to send
6. **Managing follow-up** — Case timeline, communications, reanalysis

### What Makes It Different

- **Not a chatbot** — AI is an internal tool, not the product interface
- **Deterministic rules** — Legal conclusions based on verified sources, not AI generation
- **Traceable** — Every claim links to facts and sources
- **Honest about uncertainty** — Missing information marked as such, not invented
- **Jurisdiction-aware** — Rules scoped to specific legal systems

### Current Capabilities

| Capability               | Status                                                                            |
| ------------------------ | --------------------------------------------------------------------------------- |
| Universal Problem Intake | ✅ Implemented                                                                    |
| 4 Deterministic Modules  | ✅ ES: cancellation-charge, no-delivery-refund, warranty-rejection, flight-cancel |
| Research Resolver        | ✅ Implemented (F14)                                                              |
| Document Generation      | ✅ Implemented (F12)                                                              |
| Case Management          | ✅ Implemented (F13)                                                              |
| Multi-Jurisdiction       | ✅ Implemented (F15) — 9 jurisdictions configured                                 |
| Authentication           | ❌ Not implemented                                                                |
| Billing                  | ❌ Not implemented                                                                |
| User Accounts            | ❌ Not implemented                                                                |

---

## 2. Target User

### Primary User: Spanish Consumer with a Problem

- **Who**: Regular consumer (not a lawyer)
- **When**: After experiencing a consumer issue (cancellation charge, non-delivery, warranty rejection, flight cancellation)
- **Need**: Understand what they can do, get help writing a formal complaint
- **Technical skill**: Basic — can use web browser, describe their problem
- **Language**: Spanish (primary), other languages later

### User Pain Points

1. "I don't know if I have rights in this situation"
2. "I don't know what law applies"
3. "I don't know how to write a formal complaint"
4. "I've been told different things by different people"
5. "I don't want to pay a lawyer for a simple issue"

---

## 3. User Journey (Current)

```
LANDING PAGE
    ↓
SearchBar / Select Problem
    ↓
Intake: Describe problem + provide jurisdiction
    ↓
AI Interpretation → Extract facts
    ↓
User confirms facts
    ↓
Deterministic Analysis (if ES module)
    ↓ OR
Research Resolver (if unsupported jurisdiction/module)
    ↓
Result: Claims, Actions, Sources
    ↓
Optional: Generate Document
    ↓
Download TXT
    ↓
Case stored (anonymous)
```

### Current Friction Points

1. **No case recovery** — If user closes browser, case is lost (only caseId as credential)
2. **No persistent access** — Anonymous users cannot return to their case
3. **Document download only TXT** — No PDF, no DOCX
4. **No email delivery** — Document must be manually sent
5. **Limited mobile optimization** — Functional but not polished
6. **No guidance on what happens next** — After document generated, user is on their own

---

## 4. Cost Structure

### Variable Costs (Per Case)

| Component             | Provider                    | Estimated Cost    |
| --------------------- | --------------------------- | ----------------- |
| AI Interpretation     | Groq (llama-3.1-8b-instant) | ~$0.001 per case  |
| AI Fact Extraction    | Groq                        | ~$0.001 per case  |
| AI Document Draft     | Groq                        | ~$0.002 per case  |
| Research (if needed)  | Groq + Web Search           | ~$0.01 per case   |
| **Total AI per case** |                             | **~$0.005-0.015** |

### Fixed Costs (Monthly)

| Component       | Provider          | Estimated Cost |
| --------------- | ----------------- | -------------- |
| Database        | Neon (PostgreSQL) | $0-25          |
| Object Storage  | Cloudflare R2     | $0-5           |
| Hosting         | Vercel/other      | $0-20          |
| **Total fixed** |                   | **$0-50**      |

### Cost Per User

- Average user: 1-2 cases
- Average AI cost: $0.01-0.03 per user
- Storage: negligible per user
- **Total variable cost per user: ~$0.01-0.05**

---

## 5. Business Model Analysis

### Model A: Free Product

**Pros:**

- Maximizes adoption and usage
- Builds trust (no paywall for basic understanding)
- Simple to implement
- No payment infrastructure needed
- Aligns with public interest mission

**Cons:**

- No revenue
- Must fund hosting/AI costs
- May attract abuse

**Verdict: RECOMMENDED for V1**

### Model B: Freemium

**Potential paid features:**

- PDF/DOCX export
- Multiple cases
- Historical case storage
- Advanced research
- Priority support

**Pros:**

- Revenue from power users
- Free tier validates product
- Clear value upgrade path

**Cons:**

- May fragment user experience
- Requires authentication
- Requires billing infrastructure
- May confuse what's free vs paid

**Verdict: DEFER until V2 — after validating free usage**

### Model C: Pay-per-Case

**Pros:**

- Clear value exchange
- Only pay when you use it

**Cons:**

- Users don't know value until after analysis
- Creates friction at worst moment
- May prevent users from seeking help
- Legal/ethical concerns (charging for basic rights information)

**Verdict: NOT RECOMMENDED — conflicts with trust/mission**

### Model D: Subscription

**Pros:**

- Predictable revenue
- Encourages retention

**Cons:**

- Consumer problems are infrequent (1-2 per year)
- Users won't pay monthly for occasional use
- Overkill for most consumers

**Verdict: NOT RECOMMENDED — wrong model for infrequent use**

### Model E: Credits/Usage

**Pros:**

- Flexible
- Pay for what you use

**Cons:**

- Complex to implement
- Users don't understand credits
- Creates artificial friction

**Verdict: NOT RECOMMENDED for V1**

### Model F: B2B/Professional

**Potential:**

- Consumer advocacy organizations
- Small businesses handling complaints
- Legal clinics

**Pros:**

- Higher willingness to pay
- Institutional budgets
- Can fund consumer tier

**Cons:**

- Requires different UX
- Different value proposition
- Separate product essentially

**Verdict: POSSIBLE FUTURE — but separate product**

### Model G: Hybrid

**Potential:**

- Free basic analysis
- Paid document generation
- Paid research

**Pros:**

- Revenue from value-added services
- Free tier builds trust

**Cons:**

- Requires clear value differentiation
- May confuse users

**Verdict: POSSIBLE V2 — after validating free tier**

---

## 6. Recommendation: Free V1, Then Evaluate

### Phase 1: Free Launch (Current)

- **Everything free** — analysis, research, documents
- **No authentication required** — anonymous cases
- **No billing infrastructure**
- **Focus on**: product quality, trust, usage data

### Phase 2: Evaluation (After 1000+ cases)

- Analyze usage patterns
- Identify power users vs one-time users
- Determine willingness to pay
- Identify which features warrant payment

### Phase 3: Commercial Architecture (If justified)

Based on Phase 2 data, implement:

- Authentication (for case recovery)
- Entitlements (generic, not hardcoded)
- Billing (if pay-per-case or freemium selected)

---

## 7. What Remains Free (Forever)

Core value proposition must remain free:

- Problem understanding
- Fact extraction
- Rule analysis
- Basic result display
- Case storage

### Rationale

1. **Trust** — Paywalling basic understanding erodes trust
2. **Mission** — Consumer rights information should be accessible
3. **Acquisition** — Free tier drives word-of-mouth
4. **Legal** — Charging for basic rights information may have legal implications

---

## 8. What Could Become Paid (V2, If Justified)

| Feature               | Rationale               | WTP               |
| --------------------- | ----------------------- | ----------------- |
| PDF/DOCX export       | Professional formatting | €1-3 per document |
| Extended research     | Deep source analysis    | €2-5 per research |
| Case history          | Persistent storage      | €1-2/month        |
| Multiple active cases | Power users             | €5-10/month       |
| Priority support      | Faster response         | €10-20/month      |

WTP = Willingness to Pay (estimated)

---

## 9. Authentication Requirements

### Current State

- No authentication
- CaseId is only credential
- Cases are anonymous

### When Authentication Is Needed

- **Case recovery** — User wants to return to their case
- **Multiple devices** — Access from phone + computer
- **Paid features** — Need to track usage/entitlements
- **Case history** — Persistent storage across sessions

### Recommendation

**Defer authentication until:**

1. Users request it (feedback signal)
2. Paid features are implemented
3. Case recovery becomes critical

### Minimal Authentication (When Needed)

- **Magic links** — Email-based, no passwords
- **No passwords** — Simpler, more secure
- **Case linking** — Link case to email for recovery

---

## 10. Entitlement Architecture (When Needed)

### Generic Entitlement Model

```typescript
interface Entitlement {
  feature: string; // "CASE_ANALYSIS", "RESEARCH", "DOCUMENT_GENERATION"
  limit?: number; // Max usage (null = unlimited)
  used: number; // Current usage
  status: "ACTIVE" | "LIMIT_REACHED" | "EXPIRED";
}
```

### Usage Tracking (When Needed)

```typescript
interface UsageRecord {
  userId: string;
  feature: string;
  timestamp: Date;
  caseId?: string;
  cost?: number; // AI cost incurred
}
```

### Key Principle

**Entitlements control access to product capabilities, NOT legal correctness.**

A free user and a paid user get the same legal analysis. Paid features are convenience/formatting extras.

---

## 11. Privacy Considerations

### Current State

- Cases are anonymous
- No PII collected (except what user provides in case)
- AI requests may send case data to providers (Groq/OpenAI)

### Privacy Requirements (GDPR)

- **Consent** — For AI processing, analytics
- **Minimization** — Don't collect unnecessary data
- **Deletion** — User can delete their case
- **Export** — User can export their data
- **Retention** — Define retention policy

### Recommendation

1. Add privacy notice (required for EU)
2. Add case deletion endpoint
3. Add case export endpoint
4. Document AI provider data handling
5. Implement cookie consent (if analytics added)

---

## 12. Analytics (When Needed)

### Recommended Events (Minimal)

```typescript
// Product analytics (privacy-preserving)
case_created; // New case started
case_completed; // Case reached result
document_generated; // Document created
research_used; // Research resolver invoked

// Not tracked (privacy)
case_content; // What user wrote
evidence_content; // What user uploaded
legal_analysis; // What rules applied
```

### Implementation

- Use privacy-preserving analytics (Plausible, Fathom)
- Or build simple internal analytics
- No Google Analytics (privacy concerns)
- No Mixpanel (overkill, privacy concerns)

---

## 13. Implementation Plan (If Free V1)

### Must Have (For Launch)

1. ✅ Core product (already implemented)
2. ⬜ Privacy notice page
3. ⬜ Case deletion endpoint
4. ⬜ Case export endpoint
5. ⬜ Basic error handling for users

### Nice to Have (Before Launch)

1. ⬜ PDF export
2. ⬜ Mobile optimization
3. ⬜ Onboarding improvements

### Defer (V2+)

1. Authentication
2. Billing
3. User accounts
4. Entitlements
5. Advanced analytics

---

## 14. Success Metrics (Free V1)

### Product Metrics

- **Cases created** — How many users try the product
- **Cases completed** — How many reach a result
- **Document generation rate** — How many generate documents
- **Research usage** — How many use research resolver
- **Return users** — How many come back (hard without auth)

### Quality Metrics

- **Rule accuracy** — Do deterministic results match expectations
- **Source quality** — Are sources authoritative
- **User satisfaction** — Qualitative feedback
- **Support requests** — What confuses users

### Cost Metrics

- **AI cost per case** — Is it sustainable
- **Total monthly cost** — Can we afford it
- **Cost per completed case** — Efficiency metric

---

## 15. Risk Assessment

### Low Risk

- **Abuse** — AI budgets limit abuse per case
- **Cost overrun** — Variable costs scale with usage
- **Legal liability** — Disclaimers + no legal advice positioning

### Medium Risk

- **No revenue** — Must be funded from other sources
- **Low adoption** — Need marketing/distribution
- **Quality issues** — Must monitor rule accuracy

### High Risk

- **Wrong legal conclusions** — Must be extremely careful
- **User harm** — Must clearly communicate limitations
- **Provider costs** — Must monitor AI spending

---

## 16. Decision

### Primary Decision: Free V1

**Resolveo should launch as a free product.**

Rationale:

1. Validates core value proposition
2. Builds trust (no paywall for basic understanding)
3. Simple to implement (no billing infrastructure)
4. Aligns with consumer rights mission
5. Allows learning before committing to business model

### Secondary Decision: Defer Commercial Architecture

**Commercial architecture (auth, billing, entitlements) should be deferred until:**

1. 1000+ cases created
2. Clear usage patterns emerge
3. Users request paid features
4. Cost becomes unsustainable

### Tertiary Decision: Prepare for Future

**When commercial architecture is needed:**

1. Implement generic entitlement model (not hardcoded)
2. Keep domain logic independent from billing
3. Use magic link auth (no passwords)
4. Choose billing model based on actual data

---

## 17. Next Steps

### Immediate (This Phase)

1. Add privacy notice page
2. Add case deletion endpoint
3. Add case export endpoint
4. Improve error messages for users
5. Document current state

### Short-term (Next Phase)

1. Monitor usage metrics
2. Collect user feedback
3. Identify pain points
4. Evaluate PDF export demand

### Medium-term (V2)

1. Implement authentication (if needed)
2. Implement billing (if justified)
3. Add PDF/DOCX export
4. Expand jurisdiction support

---

_Document created: 2026-09-21_
_Decision: Free V1, defer commercial architecture_
_Review date: After 1000 cases or 6 months, whichever comes first_
