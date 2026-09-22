# FASE 8.4 — flight-cancel IMPLEMENTATION REPORT

> **Updated after adversarial legal audit** (see `PHASE_8_4_FLIGHT_CANCEL_AUDIT.md`)
> Module version bumped to v2. Rules expanded from 6 to 8. All critical findings fixed.

## Selected Module

**`flight-cancel`** — Vuelo cancelado por la aerolínea

## Why This Module Was Selected

1. **EU Regulation 261/2004** provides one of the clearest, most specific legal frameworks in consumer law — fixed compensation amounts, strict deadlines, non-waivable rights
2. **Completely different resolution logic** from existing modules (airline obligation vs. seller responsibility)
3. **Structured facts** (distances, times, notice periods) produce deterministic results
4. **High real-world demand** — flight cancellations are extremely common
5. **Opens the door** for F8.5 `flight-delay` and `flight-baggage` modules

## Alternatives Considered

| Candidate          | Why Rejected                                                                 |
| ------------------ | ---------------------------------------------------------------------------- |
| `wrong-charge`     | Too similar to `cancellation-charge` (billing dispute pattern)               |
| `deposit-withheld` | Insufficient case law for deterministic rules; landlord disputes vary wildly |
| `auto-renewal`     | Overlaps with `cancellation-charge` for contract termination                 |
| `delayed-delivery` | Overlaps significantly with `no-delivery-refund`                             |

## Consumer Problem

> "Me han cancelado un vuelo. ¿Tengo derecho a compensación?"

The passenger's flight was cancelled by the airline. They need to know:

- What compensation they may be entitled to
- Whether the airline fulfilled its obligations
- What additional costs they can claim
- What steps to take next

## Jurisdiction

- **Primary**: EU Regulation 261/2004 (directly applicable in all EU member states)
- **Secondary**: TRLGDCU Art. 165 (Spanish transposition reference)
- **Scope**: Spain (`ES`), es-ES locale

## Official Sources

| Source                   | Article                                | Status    | Verification       |
| ------------------------ | -------------------------------------- | --------- | ------------------ |
| Reglamento (CE) 261/2004 | Art. 5 (cancellation rights)           | PUBLISHED | EUR-Lex 2026-09-20 |
| Reglamento (CE) 261/2004 | Art. 7 (compensation amounts)          | PUBLISHED | EUR-Lex 2026-09-20 |
| Reglamento (CE) 261/2004 | Art. 8 (reimbursement/rerouting)       | PUBLISHED | EUR-Lex 2026-09-20 |
| Reglamento (CE) 261/2004 | Art. 9 (assistance)                    | PUBLISHED | EUR-Lex 2026-09-20 |
| Reglamento (CE) 261/2004 | Art. 5.3 (extraordinary circumstances) | PUBLISHED | EUR-Lex 2026-09-20 |

## Required Facts

| Fact Key                        | Type    | Description                              |
| ------------------------------- | ------- | ---------------------------------------- |
| `flight.departure_airport`      | string  | IATA code of departure airport           |
| `flight.arrival_airport`        | string  | IATA code of arrival airport             |
| `flight.scheduled_date`         | date    | Scheduled flight date                    |
| `cancellation.date`             | date    | Date airline communicated cancellation   |
| `airline.reimbursement_offered` | boolean | Did airline offer ticket refund?         |
| `airline.re_routing_offered`    | boolean | Did airline offer alternative transport? |
| `airline.assistance_offered`    | boolean | Did airline offer assistance?            |

## Optional Facts

| Fact Key                                   | Type    | Description                                |
| ------------------------------------------ | ------- | ------------------------------------------ |
| `cancellation.notice_days`                 | number  | Days of notice (derived)                   |
| `passenger.claimed_compensation`           | boolean | Has passenger claimed?                     |
| `passenger.compensation_received`          | boolean | Has passenger received payment?            |
| `passenger.reimbursed`                     | boolean | Has passenger received refund?             |
| `airline.re_routing.accepted`              | boolean | Did passenger accept rerouting?            |
| `airline.re_routing.departure_delay_hours` | number  | Delay of alternative flight                |
| `airline.cancellation_reason`              | string  | Airline's stated reason                    |
| `airline.reason_is_extraordinary`          | boolean | Airline claims extraordinary circumstances |
| `passenger.additional_costs`               | money   | Additional costs from cancellation         |
| `flight.booking_date`                      | date    | When booking was made                      |
| `flight.number`                            | string  | Flight number                              |
| `airline.name`                             | string  | Airline name                               |

## Derived Facts

| Fact Key                   | Computation                              | Source            |
| -------------------------- | ---------------------------------------- | ----------------- |
| `cancellation.notice_days` | `scheduled_date - cancellation.date`     | Art. 5.1(c) EU261 |
| `flight.distance_km`       | Haversine distance from IATA coordinates | Art. 7 EU261      |
| `flight.compensation_tier` | 250/400/600 based on distance            | Art. 7.1 EU261    |

## Rules

| #   | Rule Key                               | Legal Basis | What It Establishes                    |
| --- | -------------------------------------- | ----------- | -------------------------------------- |
| 1   | `flight-was-cancelled`                 | Art. 5.1    | Flight was cancelled by airline        |
| 2   | `compensation-due-insufficient-notice` | Art. 5.1.c  | Notice < 14 days before departure      |
| 3   | `compensation-due-no-extraordinary`    | Art. 5.3    | No extraordinary circumstances claimed |
| 4   | `reimbursement-entitlement`            | Art. 8.1(a) | Right to ticket reimbursement exists   |
| 5   | `assistance-obligation`                | Art. 9.1    | Airline failed to offer assistance     |
| 6   | `additional-costs-claim`               | Art. 8.1(c) | Passenger incurred additional costs    |

### Anti-Hallucination Compliance

- No rule asserts "the airline violated the law"
- No rule asserts "you have a right to €600"
- Rules establish factual findings only
- Compensation amounts are derived facts, not rule conclusions
- Extraordinary circumstances burden is documented (on airline, not passenger)

## Contradictions

The module handles contradictions through the existing F1 contradiction engine:

- Contradicted cancellation date → `CONTRADICTED` status
- Contradicted notice_days → `CONTRADICTED` status
- No `latest wins` policy — contradictions persist until resolved

## Claim Statuses Used

| Status                   | When                                             |
| ------------------------ | ------------------------------------------------ |
| `SUPPORTED`              | Rule conditions met with confirmed facts         |
| `NOT_APPLICABLE`         | Rule conditions not met (e.g., notice ≥ 14 days) |
| `INSUFFICIENT_DATA`      | Required facts missing                           |
| `CONTRADICTED`           | Contradicted facts block evaluation              |
| `POTENTIALLY_APPLICABLE` | Some conditions met, some facts unconfirmed      |

## Actions

The module connects to existing Action Engine types:

- `COLLECT_INFORMATION` — when required facts are missing
- `PRESERVE_EVIDENCE` — booking confirmation, cancellation email
- `CONTACT_MERCHANT` — formal claim to airline
- `REQUEST_REFUND` — when reimbursement entitlement is SUPPORTED
- `SUBMIT_COMPLAINT` — to AESA (Spanish aviation safety agency) or national enforcement body
- `GENERATE_DOCUMENT` — formal claim letter

## Universal Intake Compatibility

The module provides:

- `problemKey`: `flight-cancel`
- `title`: "Vuelo cancelado"
- `description`: for AI routing
- `semanticSignals`: ["vuelo", "cancelado", "aerolínea", "compensación", "retraso", "airline", "flight", "cancelled"]
- `requiredFactCategories`: for AI to detect matching

## Tests

**46 tests** covering:

- Module definition (5 tests)
- Fact catalogue integrity (5 tests)
- Rule building (6 tests)
- Legal scenarios (25 tests)
  - Rule 1: flight-was-cancelled (3 scenarios)
  - Rule 2: compensation-due-insufficient-notice (6 scenarios)
  - Rule 3: compensation-due-no-extraordinary (3 scenarios)
  - Rule 4: reimbursement-entitlement (4 scenarios)
  - Rule 5: assistance-obligation (3 scenarios)
  - Rule 6: additional-costs-claim (4 scenarios)
  - Contradictions (2 scenarios)
- Edge cases (5 tests)

## Edge Cases Tested

- Same-day cancellation (0 days notice)
- Notice exactly at 14-day boundary
- Notice 13 days (just under)
- Negative notice days (cancellation after scheduled date)
- Zero additional costs
- Full scenario with all rules

## Files Changed

### New Files

| File                                                    | Purpose                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/problems/flight-cancel/definition.ts`              | Module definition v2 with 7 required + 15 optional + 3 derived facts |
| `src/problems/flight-cancel/rules.ts`                   | 8 rules with EU261/2004 source verification (v2 — audit corrected)   |
| `src/problems/flight-cancel/index.ts`                   | Public surface                                                       |
| `tests/unit/problems/flight-cancel.test.ts`             | 85 adversarial tests (v2 — expanded after audit)                     |
| `docs/PHASE_8_4_FLIGHT_CANCEL_IMPLEMENTATION_REPORT.md` | This report                                                          |

### Modified Files

| File                                    | Change                                                                                                                 | Impact                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `src/core/problems/analysis-service.ts` | Added `flight-cancel` derived facts (notice_days, distance_km, compensation_tier) with airport coordinates + Haversine | Notice_days: removed Math.max(0) clamp              |
| `src/core/result/engine.ts`             | Added 8 assertion templates for flight-cancel rules                                                                    | Updated for v2 rules                                |
| `src/core/rules/evaluator.ts`           | Fixed ANY/NOT semantics in `missingAndContradicted`                                                                    | Missing facts in ANY/NOT no longer falsely reported |

### NOT Modified (documented for integrator)

The following files need `flight-cancel` registration for full integration. These were NOT modified per the F8.4 isolation rule:

| File                                               | Change Needed                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/server/intake/composition.ts`                 | Add `import { flightCancelModule } from "@problems/flight-cancel"` + `registry.register(flightCancelModule)` |
| `src/app/page.tsx`                                 | Add to `AVAILABLE_PROBLEMS` array                                                                            |
| `src/components/SearchBar.tsx`                     | Add to `PROBLEMS` array with keywords                                                                        |
| `src/app/api/problems/[problemKey]/cases/route.ts` | Add import + register                                                                                        |
| `src/app/api/cases/[caseId]/result/route.ts`       | Add import + register                                                                                        |
| `src/app/api/cases/[caseId]/export/route.ts`       | Add import + register                                                                                        |
| `src/app/api/cases/[caseId]/actions/route.ts`      | Add import + register                                                                                        |

## Validation

```
Typecheck:   ✅ PASS (0 errors)
Lint:        ✅ PASS (1 pre-existing warning)
Tests:       ✅ 526/526 unit + 576 total (1 flaky integration — pre-existing)
Build:       ✅ PASS
Format:      ✅ PASS
```

## Known Limitations

1. **Airport coverage**: The Haversine distance lookup includes ~30 major airports. Routes between airports not in the lookup won't compute distance/compensation tier. Future: expand to full IATA database.
2. **Art. 5.1.c exceptions**: The full exception chain (alternative transport arrival time) is not fully modeled. The current rules capture the most common case (notice < 14 days).
3. **Extraordinary circumstances**: The rule establishes "no extraordinary claimed" but does not evaluate whether claimed circumstances actually qualify (that's a factual/legal determination for the consumer courts).
4. **No module registration**: Per F8.4 isolation rules, the module is not registered in the ProblemRegistry, SearchBar, or homepage. An integrator must perform this step.

## Future Improvements

1. Expand airport database to full IATA list
2. Model Art. 5.1.c alternative transport exceptions
3. Add `flight-delay` module (EU261 Art. 6 — delay > 3 hours)
4. Add `flight-baggage` module (EU261 Art. 17 — lost/damaged baggage)
5. Add AESA complaint workflow
6. Cross-module linking: `flight-cancel` + `wrong-charge` for airline billing disputes
