/**
 * Domain event factory (Fase 1).
 * Events exist for traceability/future integrations — NOT event sourcing
 * (STRESS_TEST §14): current state remains the primary model.
 */
import type { CaseEvent, CaseEventPayload, CaseEventType } from "../types";
import type { IsoDateTime } from "../shared/temporal";
import { newEventId } from "./ids";

export function createEvent(
  caseId: string,
  type: CaseEventType,
  payload: CaseEventPayload,
  now: IsoDateTime,
): CaseEvent {
  return { id: newEventId(), caseId, type, occurredAt: now, payload };
}
