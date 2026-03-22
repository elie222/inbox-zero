import { describe, it, expect } from "vitest";

import { preFilter } from "@/utils/chief-of-staff/pre-filter";
import { detectVenture } from "@/utils/chief-of-staff/routing/venture-detector";
import { isDayProtected } from "@/utils/chief-of-staff/calendar/day-protection";
import {
  parseEventPrefix,
  PrefixType,
} from "@/utils/chief-of-staff/calendar/prefix-parser";
import { parseShippingEmail } from "@/utils/chief-of-staff/shipping";
import { PreFilterResult, Venture } from "@/utils/chief-of-staff/types";

// ---------------------------------------------------------------------------
// Pre-filter tests
// ---------------------------------------------------------------------------

describe("preFilter", () => {
  it("blocks promotional email", () => {
    const result = preFilter({
      category: "promotions",
      from: "deals@newsletter.com",
      headers: {},
      labels: [],
      subject: "50% off everything today only!",
    });

    expect(result.action).toBe(PreFilterResult.SKIP);
  });

  it("detects shipping email from ship-confirm@amazon.com with 'shipped' subject", () => {
    const result = preFilter({
      category: null,
      from: "ship-confirm@amazon.com",
      headers: {},
      labels: [],
      subject: "Your order has shipped",
    });

    expect(result.action).toBe(PreFilterResult.CREATE_CALENDAR_EVENT);
  });

  it("processes a normal client email asking to reschedule", () => {
    const result = preFilter({
      category: null,
      from: "client@example.com",
      headers: {},
      labels: [],
      subject: "Can we reschedule our meeting?",
    });

    expect(result.action).toBe(PreFilterResult.PROCESS);
  });
});

// ---------------------------------------------------------------------------
// Venture detection tests
// ---------------------------------------------------------------------------

describe("detectVenture", () => {
  it("detects SMART_COLLEGE from nick@smartcollege.com inbox", () => {
    const venture = detectVenture({
      clientGroupVenture: null,
      inboxEmail: "nick@smartcollege.com",
      senderEmail: "student@gmail.com",
    });

    expect(venture).toBe(Venture.SMART_COLLEGE);
  });

  it("detects SMART_COLLEGE from sender @smartcollege.com domain", () => {
    const venture = detectVenture({
      clientGroupVenture: null,
      inboxEmail: "leekenick@gmail.com",
      senderEmail: "advisor@smartcollege.com",
    });

    expect(venture).toBe(Venture.SMART_COLLEGE);
  });

  it("defaults to PERSONAL for unknown sender on personal inbox", () => {
    const venture = detectVenture({
      clientGroupVenture: null,
      inboxEmail: "leekenick@gmail.com",
      senderEmail: "someone@randomdomain.com",
    });

    expect(venture).toBe(Venture.PERSONAL);
  });
});

// ---------------------------------------------------------------------------
// Day protection tests
// ---------------------------------------------------------------------------

describe("isDayProtected", () => {
  it("blocks Tuesday (protected recovery day)", () => {
    // 2026-03-17 is a Tuesday
    const tuesday = new Date("2026-03-17T12:00:00-06:00");
    const result = isDayProtected(tuesday, false);

    expect(result.protected).toBe(true);
  });

  it("allows Friday when isVip=true", () => {
    // 2026-03-20 is a Friday
    const friday = new Date("2026-03-20T12:00:00-06:00");
    const result = isDayProtected(friday, true);

    expect(result.protected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Prefix parser tests
// ---------------------------------------------------------------------------

describe("parseEventPrefix", () => {
  it("returns HARD_BLOCK for a title with no prefix", () => {
    const parsed = parseEventPrefix("Team standup");

    expect(parsed.type).toBe(PrefixType.HARD_BLOCK);
    expect(parsed.cleanTitle).toBe("Team standup");
  });

  it("returns SOFT for a title prefixed with ~", () => {
    const parsed = parseEventPrefix("~ Gym session");

    expect(parsed.type).toBe(PrefixType.SOFT);
    expect(parsed.cleanTitle).toBe("Gym session");
  });

  it("returns INFORMATIONAL for a title prefixed with FYI:", () => {
    const parsed = parseEventPrefix("FYI: Conference call notes");

    expect(parsed.type).toBe(PrefixType.INFORMATIONAL);
    expect(parsed.cleanTitle).toBe("Conference call notes");
  });
});

// ---------------------------------------------------------------------------
// Shipping parser tests
// ---------------------------------------------------------------------------

describe("parseShippingEmail", () => {
  it("extracts a reasonable item description from a shipping email", () => {
    const description = parseShippingEmail({
      from: "ship-confirm@amazon.com",
      subject: "Your order has shipped",
    });

    expect(typeof description).toBe("string");
    expect(description.length).toBeGreaterThan(0);
  });

  it("extracts item name from 'order of X has shipped' subject", () => {
    const description = parseShippingEmail({
      from: "ship-confirm@amazon.com",
      subject: "Your order of Standing Desk has shipped",
    });

    expect(description).toBe("Standing Desk");
  });
});
