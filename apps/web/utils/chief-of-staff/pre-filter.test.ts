import { describe, it, expect } from "vitest";
import { preFilter } from "./pre-filter";
import { PreFilterResult, FilterReason } from "./types";

describe("preFilter", () => {
  it("skips promotional emails (category: promotions)", () => {
    const result = preFilter({
      from: "deals@shop.com",
      subject: "50% off today only!",
      labels: [],
      category: "promotions",
      headers: {},
    });
    expect(result.action).toBe(PreFilterResult.SKIP);
    expect(result.reason).toBe(FilterReason.GMAIL_CATEGORY);
  });

  it("skips social category", () => {
    const result = preFilter({
      from: "noreply@twitter.com",
      subject: "Someone liked your tweet",
      labels: [],
      category: "social",
      headers: {},
    });
    expect(result.action).toBe(PreFilterResult.SKIP);
    expect(result.reason).toBe(FilterReason.GMAIL_CATEGORY);
  });

  it("skips emails with List-Unsubscribe header", () => {
    const result = preFilter({
      from: "newsletter@example.com",
      subject: "Weekly digest",
      labels: [],
      category: null,
      headers: { "List-Unsubscribe": "<mailto:unsubscribe@example.com>" },
    });
    expect(result.action).toBe(PreFilterResult.SKIP);
    expect(result.reason).toBe(FilterReason.MAILING_LIST);
  });

  it("skips bounce from mailer-daemon", () => {
    const result = preFilter({
      from: "mailer-daemon@mail.example.com",
      subject: "Delivery Status Notification (Failure)",
      labels: [],
      category: null,
      headers: {},
    });
    expect(result.action).toBe(PreFilterResult.SKIP);
    expect(result.reason).toBe(FilterReason.BOUNCE);
  });

  it("skips bounce with multipart/report content-type", () => {
    const result = preFilter({
      from: "postmaster@mail.example.com",
      subject: "Undelivered Mail Returned to Sender",
      labels: [],
      category: null,
      headers: {
        "content-type": "multipart/report; report-type=delivery-status",
      },
    });
    expect(result.action).toBe(PreFilterResult.SKIP);
    expect(result.reason).toBe(FilterReason.BOUNCE);
  });

  it("detects shipping by sender (ship-confirm@amazon.com)", () => {
    const result = preFilter({
      from: "ship-confirm@amazon.com",
      subject: "Your Amazon order has shipped",
      labels: [],
      category: null,
      headers: {},
    });
    expect(result.action).toBe(PreFilterResult.CREATE_CALENDAR_EVENT);
    expect(result.reason).toBe(FilterReason.SHIPPING);
  });

  it("detects shipping by subject keyword ('Your package is out for delivery')", () => {
    const result = preFilter({
      from: "notifications@somestore.com",
      subject: "Your package is out for delivery",
      labels: [],
      category: null,
      headers: {},
    });
    expect(result.action).toBe(PreFilterResult.CREATE_CALENDAR_EVENT);
    expect(result.reason).toBe(FilterReason.SHIPPING);
  });

  it("batch-summarizes Gmail updates category", () => {
    const result = preFilter({
      from: "noreply@github.com",
      subject: "Your CI run completed",
      labels: [],
      category: "updates",
      headers: {},
    });
    expect(result.action).toBe(PreFilterResult.BATCH_SUMMARY);
    expect(result.reason).toBe(FilterReason.BATCH_SUMMARY);
  });

  it("processes normal email (returns PROCESS)", () => {
    const result = preFilter({
      from: "client@company.com",
      subject: "Re: Project proposal",
      labels: [],
      category: null,
      headers: {},
    });
    expect(result.action).toBe(PreFilterResult.PROCESS);
    expect(result.reason).toBeNull();
  });

  it("respects allowlist override (smartcollege.com domain with list-unsubscribe still processes)", () => {
    const result = preFilter(
      {
        from: "parent@smartcollege.com",
        subject: "Re: Application update",
        labels: [],
        category: null,
        headers: {
          "List-Unsubscribe": "<mailto:unsubscribe@smartcollege.com>",
        },
      },
      { allowedDomains: ["smartcollege.com"] },
    );
    expect(result.action).toBe(PreFilterResult.PROCESS);
    expect(result.reason).toBeNull();
  });
});
