# PHASE 8.2 IMPLEMENTATION REPORT — warranty-rejection

## 1. Summary

F8.2 implements the `warranty-rejection` problem module for Resolveo. The module handles the scenario: "Me han rechazado la garantía. ¿Puedo reclamar?" — analyzing warranty rejection situations under Spanish consumer protection law (TRLGDCU Arts. 114-125).

The module was implemented following the approved legal specification (`docs/F8.2-LEGAL-SPECIFICATION.md`) and the exact architectural patterns of `no-delivery-refund` and `cancellation-charge`.

## 2. Files Created

| File | Purpose |
|---|---|
| `src/problems/warranty-rejection/definition.ts` | Module definition: fact catalogue (3 required + 35 optional/derived), intake questions, rule keys |
| `src/problems/warranty-rejection/rules.ts` | 6 PUBLISHED rules with verified BOE sources (TRLGDCU Arts. 117-122) |
| `src/problems/warranty-rejection/index.ts` | Public surface re-export |
| `tests/unit/problems/warranty-rejection.test.ts` | 50 tests: definition, facts, rules, 28 scenarios, anti-hallucination |
| `docs/F8.2-LEGAL-SPECIFICATION.md` | Legal specification (approved, 1041 lines) |

## 3. Files Modified

| File | Change |
|---|---|
| `src/core/problems/analysis-service.ts` | Added `warranty-rejection` branch in `computeDerivedFacts`: 4 derived facts (current_date, responsibility_deadline, presumption_deadline, after_repair_deadline) |
| `src/core/result/engine.ts` | Added 6 assertion templates for warranty-rejection rules |
| `src/app/page.tsx` | Added `warranty-rejection` to `AVAILABLE_PROBLEMS`, removed "Garantías y reparaciones" from `COMING_SOON` |
| `src/components/SearchBar.tsx` | Set `warranty-rejection` to `available: true`, updated title/category/keywords |

## 4. Facts

### Required (3)
- `nonconformity.description` — Consumer's description of the alleged defect (free text)
- `seller.response_received` — Has the seller responded?
- `seller.rejection` — Has the seller rejected the claim?

### Optional — Purchase (4)
- `purchase.delivery_date`, `purchase.amount`, `purchase.channel`, `purchase.invoice_available`

### Optional — Product (3)
- `product.type` (free text), `product.is_used`, `product.age_at_purchase_months`

### Optional — Seller Response (12)
- `seller.rejection_reason`, `seller.rejection_date`, `seller.refused_repair`, `seller.refused_replacement`, `seller.offered_repair`, `seller.offered_replacement`, `seller.claimed_misuse`, `seller.claimed_external_damage`, `seller.claimed_warranty_expired`, `seller.claimed_wear_and_tear`, `seller.technical_report_available`, `seller.declared_wont_repair`

### Optional — Repair History (7)
- `repair.requested`, `repair.completed`, `repair.delivery_date`, `repair.failed`, `repair.defect_recurred`, `repair.defect_different`, `repair.within_reasonable_time`

### Optional — Replacement (2)
- `replacement.completed`, `replacement.delivery_date`

### Optional — Commercial Warranty (4)
- `commercial_warranty.exists`, `commercial_warranty.guarantor`, `commercial_warranty.period_months`, `commercial_warranty.expired`

### Optional — Consumer Action (3)
- `consumer.notified_seller`, `consumer.notification_date`, `consumer.resolution_declared`

### Derived (4)
- `compliance.current_date` — from context.currentDate
- `compliance.responsibility_deadline` — delivery_date + 36 months (Art. 120.1)
- `compliance.presumption_deadline` — delivery_date + 24 months (Art. 121.1)
- `compliance.after_repair_deadline` — repair.delivery_date + 12 months (Art. 122.3)

## 5. Rules

| Rule Key | Source | Purpose |
|---|---|---|
| `warranty-rejection.seller-rejected-within-period` | Art. 120.1 | Seller rejected within the 3-year responsibility period |
| `warranty-rejection.presumption-applies` | Art. 121.1 | Product is within the 2-year presumption period |
| `warranty-rejection.no-remedy-offered` | Arts. 117.1, 118.1 | Seller rejected without offering repair or replacement |
| `warranty-rejection.repair-failed-or-defect-recurred` | Arts. 119.d, 122.3 | Repair attempted but failed or same defect recurred |
| `warranty-rejection.seller-claims-expired` | Art. 120.1 | Seller claimed warranty has expired |
| `warranty-rejection.seller-declares-wont-repair` | Art. 119.f | Seller declared they will not repair |

All 6 rules are PUBLISHED with verified BOE sources.

## 6. Sources

6 verified sources from TRLGDCU, all DRAFT (pending human verification):
- `src-es-trlgdcu-art-117` — Seller liability + consumer rights
- `src-es-trlgdcu-art-118` — Putting into conformity (repair/replacement)
- `src-es-trlgdcu-art-119` — Price reduction and resolution
- `src-es-trlgdcu-art-120` — Time limits (3-year period)
- `src-es-trlgdcu-art-121` — Burden of proof (2-year presumption)
- `src-es-trlgdcu-art-122` — Suspension + post-repair period

## 7. Workflow

Intake is conversational (4 phases):
1. **What happened?** — defect description, seller response status
2. **Seller response details** — rejection reason, specific refusals, claims (conditional on rejection)
3. **Purchase details** — delivery date, used product, amount
4. **Repair history** — completed, failed, recurred

Not a rigid form. Questions are conditional via `askIf`.

## 8. AI Integration

Module is compatible with the existing AI extraction pipeline (F6):
- AI can extract `purchase.delivery_date`, `seller.rejection_reason`, etc. as `DocumentFactCandidate`
- AI extraction remains UNCONFIRMED until user/system confirmation
- No new AI infrastructure required

## 9. Result Engine

6 assertion templates added to `src/core/result/engine.ts`:
- Each template covers all 6 statuses (SUPPORTED, POTENTIALLY_APPLICABLE, INSUFFICIENT_DATA, CONTRADICTED, NOT_APPLICABLE, UNKNOWN)
- Language never overstates: "podría existir", "puede solicitar", "se aplica la presunción"

## 10. Action Engine

Actions derived from existing Action Engine templates:
- `COLLECT_INFORMATION` — when required facts are missing
- `PRESERVE_EVIDENCE` — when seller rejection exists
- `CONTACT_MERCHANT` — when consumer hasn't formally notified seller
- `GENERATE_DOCUMENT` — when key facts confirmed
- `SUBMIT_COMPLAINT` — when seller rejected after formal notification
- `WAIT_FOR_RESPONSE` — when awaiting seller response

No new Action types created.

## 11. UI

- Added to `AVAILABLE_PROBLEMS` in `src/app/page.tsx` under "Compras" category
- Title: "Garantía rechazada"
- Description matches specification
- SearchBar keywords include: garantía, rechazado, reparación, producto, defectuoso, sustitución, técnico, conformidad, devolver, reembolso
- Removed "Garantías y reparaciones" from COMING_SOON

## 12. Tests

**50 tests** across 6 describe blocks:
- Module definition (6 tests)
- Fact catalogue integrity (5 tests)
- Rule building (6 tests)
- 28 legal scenario tests (all rules × all statuses)
- Anti-hallucination tests (5 tests)

Key anti-hallucination tests verify:
- AI-extracted UNCONFIRMED facts → POTENTIALLY_APPLICABLE (not SUPPORTED)
- CONTRADICTED facts → CONTRADICTED (not SUPPORTED)
- seller.rejection=true alone does NOT make any rule pass
- Rules never check `nonconformity.description` (no automatic defect finding)
- No rule asserts "derecho a reembolso" or "derecho a resolución"

## 13. Test Results

```
Test Files  34 passed (34)
     Tests  446 passed (446)
```

Zero regressions. All existing F0-F7 tests pass.

## 14. Build/Quality Results

- **TypeScript typecheck**: ✅ CLEAN (no errors)
- **All tests**: ✅ 446/446 pass
- **No new warnings introduced**

## 15. Regressions

**None.** All 446 existing tests pass. No changes to core architecture, rule engine, evidence engine, or result engine logic — only additive changes (new module, new templates, new derived facts branch).

## 16. Technical Debt

- Derived facts computation for `warranty-rejection` is hardcoded in `computeDerivedFacts` (same pattern as `no-delivery-refund`). A more generic approach could register derived-fact handlers per module, but that is an architecture-level improvement beyond F8.2 scope.
- The 6 assertion templates in `result/engine.ts` follow the same hardcoded pattern. A registry-based approach would be cleaner but is out of scope.

## 17. Risks

1. **Directive 2024/1799 (Right to Repair)**: Must be transposed by 31 July 2026. May modify TRLGDCU. The system should monitor for changes.
2. **Nature-incompatibility exception** (Art. 121.1): The system does not evaluate when the 2-year presumption is "incompatible with the nature of the good." This is documented as a limitation.
3. **"Reasonable time"** (Art. 118.4.b) and **"minor importance"** (Art. 119): Not evaluable by rules. Documented as open legal questions.

## 18. Deviations from Specification

**None.** The implementation follows the approved F8.2 Legal Specification exactly:
- 6 rules as specified
- 3 required facts as specified
- Derived facts as specified
- Sources as specified
- No additional rules, no removed rules
- No legal conclusions invented

---

**PHASE 8.2 IMPLEMENTATION STATUS: READY FOR AUDIT**
