import { describe, expect, it } from "vitest";

import { InvalidCaseStateTransition, allowedEvents, transition } from "@core/case/state-machine";

const T = (
  current: Parameters<typeof transition>[0]["current"],
  event: Parameters<typeof transition>[0]["event"],
  hasUnresolvedContradictions?: boolean,
) => transition({ current, event, hasUnresolvedContradictions });

describe("case state machine", () => {
  it("follows the happy path", () => {
    expect(T("DRAFT", "START_COLLECTING").next).toBe("COLLECTING_INFORMATION");
    expect(T("COLLECTING_INFORMATION", "SUBMIT_FOR_ANALYSIS").next).toBe("READY_FOR_ANALYSIS");
    expect(T("READY_FOR_ANALYSIS", "ANALYSIS_COMPLETED").next).toBe("RESULT_AVAILABLE");
    expect(T("RESULT_AVAILABLE", "ACTION_STARTED").next).toBe("ACTION_IN_PROGRESS");
  });

  it("supports alternative routes: needs-info and contradictions", () => {
    expect(T("READY_FOR_ANALYSIS", "ANALYSIS_NEEDS_MORE_INFO").next).toBe("NEEDS_INFORMATION");
    expect(T("ANALYZING_X", "ANALYSIS_NEEDS_MORE_INFO").next).toBe("NEEDS_INFORMATION");
    expect(T("COLLECTING_INFORMATION", "CONTRADICTION_DETECTED").next).toBe("HAS_CONTRADICTIONS");
    expect(T("NEEDS_INFORMATION", "SUBMIT_FOR_ANALYSIS").next).toBe("READY_FOR_ANALYSIS");
  });

  it("resolving the LAST contradiction returns to collecting; remaining ones keep status", () => {
    expect(T("HAS_CONTRADICTIONS", "CONTRADICTION_RESOLVED", false).next).toBe(
      "COLLECTING_INFORMATION",
    );
    expect(T("HAS_CONTRADICTIONS", "CONTRADICTION_RESOLVED", true).next).toBe("HAS_CONTRADICTIONS");
  });

  it("rejects arbitrary transitions with a typed error", () => {
    expect(() => T("DRAFT", "ACTION_STARTED")).toThrow(InvalidCaseStateTransition);
    expect(() => T("CLOSED", "ACTION_STARTED")).toThrow(InvalidCaseStateTransition);
    expect(() => T("RESULT_AVAILABLE", "START_COLLECTING")).toThrow(InvalidCaseStateTransition);
    // property: an invalid transition NEVER produces a valid new state (it throws)
    for (const from of ["DRAFT", "CLOSED"] as const) {
      expect(() => T(from, "RESPONSE_RECEIVED")).toThrow(InvalidCaseStateTransition);
    }
  });

  it("CLOSE_CASE is legal from most states and REOPEN only from CLOSED", () => {
    expect(T("ACTION_IN_PROGRESS", "CLOSE_CASE").next).toBe("CLOSED");
    expect(T("DRAFT", "CLOSE_CASE").next).toBe("CLOSED");
    expect(() => T("COLLECTING_INFORMATION", "REOPEN")).toThrow(InvalidCaseStateTransition);
    expect(T("CLOSED", "REOPEN").next).toBe("COLLECTING_INFORMATION");
  });

  it("reports whether status changed and the right event type", () => {
    expect(T("DRAFT", "START_COLLECTING")).toMatchObject({
      changed: true,
      eventType: "CASE_STATUS_CHANGED",
    });
    // no-op style transition: resolving the last contradiction while already collecting
    const noop = T("HAS_CONTRADICTIONS", "CONTRADICTION_RESOLVED", true);
    expect(noop).toMatchObject({ changed: false, eventType: "CASE_UPDATED" });
  });

  it("lists allowed events per status", () => {
    expect(allowedEvents("DRAFT")).toContain("START_COLLECTING");
    expect(allowedEvents("DRAFT")).not.toContain("ANALYSIS_COMPLETED");
    expect(allowedEvents("ANALYZING_X")).toContain("ANALYSIS_COMPLETED");
  });
});
