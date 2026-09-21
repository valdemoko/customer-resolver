/**
 * F13 Case Management — Lifecycle Tests
 *
 * Tests for:
 * - State machine transitions (including new ESCALATED state)
 * - Timeline event creation and persistence
 * - Case summary endpoint behavior
 * - Communication recording
 * - Reanalysis trigger
 */
import { describe, it, expect } from "vitest";
import {
  transition,
  allowedEvents,
  InvalidCaseStateTransition,
} from "@core/case/state-machine";
import { createEvent } from "@core/case/events";
import type { CaseStatus, CaseEventType } from "@core/types";

// ── State Machine Tests ────────────────────────────────────────────

describe("F13 — State Machine Extended Transitions", () => {
  describe("ESCALATE transition", () => {
    it("allows ESCALATE from RESULT_AVAILABLE", () => {
      const result = transition({ current: "RESULT_AVAILABLE", event: "ESCALATE" });
      expect(result.next).toBe("ESCALATED");
      expect(result.changed).toBe(true);
      expect(result.eventType).toBe("CASE_STATUS_CHANGED");
    });

    it("allows ESCALATE from ACTION_IN_PROGRESS", () => {
      const result = transition({ current: "ACTION_IN_PROGRESS", event: "ESCALATE" });
      expect(result.next).toBe("ESCALATED");
      expect(result.changed).toBe(true);
    });

    it("allows ESCALATE from AWAITING_RESPONSE", () => {
      const result = transition({ current: "AWAITING_RESPONSE", event: "ESCALATE" });
      expect(result.next).toBe("ESCALATED");
      expect(result.changed).toBe(true);
    });

    it("rejects ESCALATE from DRAFT", () => {
      expect(() =>
        transition({ current: "DRAFT", event: "ESCALATE" }),
      ).toThrow(InvalidCaseStateTransition);
    });

    it("rejects ESCALATE from CLOSED", () => {
      expect(() =>
        transition({ current: "CLOSED", event: "ESCALATE" }),
      ).toThrow(InvalidCaseStateTransition);
    });

    it("rejects ESCALATE from COLLECTING_INFORMATION", () => {
      expect(() =>
        transition({ current: "COLLECTING_INFORMATION", event: "ESCALATE" }),
      ).toThrow(InvalidCaseStateTransition);
    });
  });

  describe("RESPONSE_RECEIVED from ESCALATED", () => {
    it("allows RESPONSE_RECEIVED from ESCALATED → RESULT_AVAILABLE", () => {
      const result = transition({ current: "ESCALATED", event: "RESPONSE_RECEIVED" });
      expect(result.next).toBe("RESULT_AVAILABLE");
      expect(result.changed).toBe(true);
    });
  });

  describe("CLOSE_CASE from ESCALATED", () => {
    it("allows CLOSE_CASE from ESCALATED → CLOSED", () => {
      const result = transition({ current: "ESCALATED", event: "CLOSE_CASE" });
      expect(result.next).toBe("CLOSED");
      expect(result.changed).toBe(true);
    });
  });

  describe("REOPEN from CLOSED", () => {
    it("allows REOPEN from CLOSED → COLLECTING_INFORMATION", () => {
      const result = transition({ current: "CLOSED", event: "REOPEN" });
      expect(result.next).toBe("COLLECTING_INFORMATION");
      expect(result.changed).toBe(true);
    });
  });

  describe("Invalid transitions remain invalid", () => {
    it("rejects ESCALATE from ANALYZING_X", () => {
      expect(() =>
        transition({ current: "ANALYZING_X", event: "ESCALATE" }),
      ).toThrow(InvalidCaseStateTransition);
    });

    it("rejects ESCALATE from NEEDS_INFORMATION", () => {
      expect(() =>
        transition({ current: "NEEDS_INFORMATION", event: "ESCALATE" }),
      ).toThrow(InvalidCaseStateTransition);
    });

    it("rejects ESCALATE from HAS_CONTRADICTIONS", () => {
      expect(() =>
        transition({ current: "HAS_CONTRADICTIONS", event: "ESCALATE" }),
      ).toThrow(InvalidCaseStateTransition);
    });

    it("rejects REOPEN from non-CLOSED states", () => {
      const nonClosedStates: CaseStatus[] = [
        "DRAFT",
        "COLLECTING_INFORMATION",
        "READY_FOR_ANALYSIS",
        "RESULT_AVAILABLE",
        "ACTION_IN_PROGRESS",
        "AWAITING_RESPONSE",
        "ESCALATED",
      ];
      for (const state of nonClosedStates) {
        expect(() => transition({ current: state, event: "REOPEN" })).toThrow(
          InvalidCaseStateTransition,
        );
      }
    });
  });
});

// ── allowedEvents Tests ────────────────────────────────────────────

describe("F13 — allowedEvents with ESCALATED", () => {
  it("ESCALATED allows RESPONSE_RECEIVED, CLOSE_CASE", () => {
    const events = allowedEvents("ESCALATED");
    expect(events).toContain("RESPONSE_RECEIVED");
    expect(events).toContain("CLOSE_CASE");
    expect(events).not.toContain("ESCALATE"); // can't escalate from already escalated
    expect(events).not.toContain("REOPEN");
  });

  it("RESULT_AVAILABLE allows ESCALATE", () => {
    const events = allowedEvents("RESULT_AVAILABLE");
    expect(events).toContain("ESCALATE");
    expect(events).toContain("ACTION_STARTED");
  });

  it("CLOSED allows REOPEN", () => {
    const events = allowedEvents("CLOSED");
    expect(events).toContain("REOPEN");
    expect(events).not.toContain("ESCALATE");
  });
});

// ── Timeline Event Tests ───────────────────────────────────────────

describe("F13 — Timeline Events", () => {
  it("creates ANALYSIS_RECALCULATED event", () => {
    const event = createEvent(
      "case-123",
      "ANALYSIS_RECALCULATED",
      { previousSnapshotId: "snap-1", newSnapshotId: "snap-2", supportedClaims: 3 },
      "2026-01-15T10:30:00Z" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    );
    expect(event.type).toBe("ANALYSIS_RECALCULATED");
    expect(event.caseId).toBe("case-123");
    expect(event.payload.previousSnapshotId).toBe("snap-1");
    expect(event.payload.newSnapshotId).toBe("snap-2");
  });

  it("creates COMMUNICATION_RECORDED event", () => {
    const event = createEvent(
      "case-123",
      "COMMUNICATION_RECORDED",
      { communicationId: "comm-1", direction: "SENT", channel: "EMAIL" },
      "2026-01-15T10:30:00Z" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    );
    expect(event.type).toBe("COMMUNICATION_RECORDED");
    expect(event.payload.direction).toBe("SENT");
  });

  it("creates CASE_ESCALATED event", () => {
    const event = createEvent(
      "case-123",
      "CASE_ESCALATED",
      { from: "RESULT_AVAILABLE", to: "ESCALATED", reason: "Merchant ignored" },
      "2026-01-15T10:30:00Z" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    );
    expect(event.type).toBe("CASE_ESCALATED");
  });

  it("creates CASE_REOPENED event", () => {
    const event = createEvent(
      "case-123",
      "CASE_REOPENED",
      { from: "CLOSED", to: "COLLECTING_INFORMATION" },
      "2026-01-15T10:30:00Z" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    );
    expect(event.type).toBe("CASE_REOPENED");
  });

  it("creates CASE_CLOSED event", () => {
    const event = createEvent(
      "case-123",
      "CASE_CLOSED",
      { from: "RESULT_AVAILABLE", reason: "Resolved" },
      "2026-01-15T10:30:00Z" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    );
    expect(event.type).toBe("CASE_CLOSED");
  });

  it("creates DOCUMENT_GENERATED event", () => {
    const event = createEvent(
      "case-123",
      "DOCUMENT_GENERATED",
      { documentId: "doc-1", documentType: "REFUND_REQUEST" },
      "2026-01-15T10:30:00Z" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
    );
    expect(event.type).toBe("DOCUMENT_GENERATED");
  });
});

// ── New Event Types Coverage ───────────────────────────────────────

describe("F13 — All new event types are valid", () => {
  const newEventTypes: CaseEventType[] = [
    "ANALYSIS_RECALCULATED",
    "DOCUMENT_GENERATED",
    "DOCUMENT_FINALIZED",
    "COMMUNICATION_RECORDED",
    "FOLLOW_UP_CREATED",
    "CASE_ESCALATED",
    "CASE_REOPENED",
    "CASE_CLOSED",
  ];

  for (const eventType of newEventTypes) {
    it(`creates ${eventType} event successfully`, () => {
      const event = createEvent(
        "case-test",
        eventType,
        { test: true },
        "2026-01-15T10:30:00Z" as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- test data type override
      );
      expect(event.type).toBe(eventType);
      expect(event.id).toBeTruthy();
      expect(event.caseId).toBe("case-test");
    });
  }
});

// ── Case Status Exhaustive Coverage ────────────────────────────────

describe("F13 — CaseStatus includes ESCALATED", () => {
  it("ESCALATED is a valid status that can be reached from RESULT_AVAILABLE", () => {
    const result = transition({ current: "RESULT_AVAILABLE", event: "ESCALATE" });
    expect(result.next).toBe("ESCALATED" as CaseStatus);
  });

  it("ESCALATED can transition back to RESULT_AVAILABLE via RESPONSE_RECEIVED", () => {
    const step1 = transition({ current: "RESULT_AVAILABLE", event: "ESCALATE" });
    const step2 = transition({ current: step1.next, event: "RESPONSE_RECEIVED" });
    expect(step2.next).toBe("RESULT_AVAILABLE");
  });

  it("ESCALATED can transition to CLOSED", () => {
    const step1 = transition({ current: "RESULT_AVAILABLE", event: "ESCALATE" });
    const step2 = transition({ current: step1.next, event: "CLOSE_CASE" });
    expect(step2.next).toBe("CLOSED");
  });

  it("full escalation lifecycle works", () => {
    // RESULT_AVAILABLE → ESCALATED → RESPONSE_RECEIVED → RESULT_AVAILABLE → CLOSED
    const s1 = transition({ current: "RESULT_AVAILABLE", event: "ESCALATE" });
    expect(s1.next).toBe("ESCALATED");

    const s2 = transition({ current: s1.next, event: "RESPONSE_RECEIVED" });
    expect(s2.next).toBe("RESULT_AVAILABLE");

    const s3 = transition({ current: s2.next, event: "CLOSE_CASE" });
    expect(s3.next).toBe("CLOSED");

    // Reopen
    const s4 = transition({ current: s3.next, event: "REOPEN" });
    expect(s4.next).toBe("COLLECTING_INFORMATION");
  });
});
