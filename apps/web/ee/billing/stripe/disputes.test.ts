import { describe, expect, it } from "vitest";
import {
  buildDisputeEvidence,
  type DisputeFacts,
  getDisputeDecision,
} from "./disputes";

const chargedAt = new Date("2026-11-01T00:00:00Z");

describe("getDisputeDecision", () => {
  it("contests an uncanceled renewal the customer kept using", () => {
    expect(getDisputeDecision(facts())).toEqual({ contest: true });
  });

  it("does not contest when cancellation was requested before the charge", () => {
    expect(
      getDisputeDecision(
        facts({ cancellationRequestedAt: new Date("2026-10-20T00:00:00Z") }),
      ),
    ).toMatchObject({ contest: false });
  });

  it("contests when cancellation came only after the charge", () => {
    expect(
      getDisputeDecision(
        facts({ cancellationRequestedAt: new Date("2026-11-05T00:00:00Z") }),
      ),
    ).toEqual({ contest: true });
  });

  it("does not contest without usage after the charge", () => {
    expect(
      getDisputeDecision(
        facts({
          lastActiveAt: new Date("2026-10-15T00:00:00Z"),
          assistantMessagesSinceCharge: 0,
        }),
      ),
    ).toMatchObject({ contest: false });
  });

  it("counts assistant messages as usage", () => {
    expect(
      getDisputeDecision(
        facts({ lastActiveAt: null, assistantMessagesSinceCharge: 3 }),
      ),
    ).toEqual({ contest: true });
  });

  it("does not contest a refunded charge", () => {
    expect(getDisputeDecision(facts({ refunded: true }))).toMatchObject({
      contest: false,
    });
  });
});

describe("buildDisputeEvidence", () => {
  it("puts the rebuttal in the cancellation field for cancellation disputes", () => {
    const evidence = buildDisputeEvidence({
      facts: facts(),
      reason: "subscription_canceled",
    });

    expect(evidence.cancellation_rebuttal).toContain("2026-11-10");
    expect(evidence.uncategorized_text).toBeUndefined();
    expect(evidence.service_date).toBe("2026-11-01 to 2026-12-01");
  });

  it("puts the rebuttal in the general field for other reasons", () => {
    const evidence = buildDisputeEvidence({
      facts: facts(),
      reason: "unrecognized",
    });

    expect(evidence.uncategorized_text).toContain("sub_123");
    expect(evidence.cancellation_rebuttal).toBeUndefined();
  });
});

function facts(overrides: Partial<DisputeFacts> = {}): DisputeFacts {
  return {
    chargedAt,
    subscriptionId: "sub_123",
    servicePeriod: {
      start: chargedAt,
      end: new Date("2026-12-01T00:00:00Z"),
    },
    cancellationRequestedAt: null,
    refunded: false,
    customerEmail: "customer@example.com",
    lastActiveAt: new Date("2026-11-10T00:00:00Z"),
    assistantMessagesSinceCharge: 0,
    ...overrides,
  };
}
