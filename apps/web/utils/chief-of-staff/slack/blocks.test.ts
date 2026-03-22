import { describe, it, expect } from "vitest";
import {
  buildApprovalMessage,
  buildAutoHandleMessage,
  buildBatchParentMessage,
  buildFlagOnlyMessage,
} from "./blocks";
import { CosCategory, Venture } from "../types";
import type { KnownBlock } from "@slack/types";

const baseResponse = {
  category: CosCategory.CLIENT_PARENT,
  summary: "Client asking about scheduling a session next week.",
  actionTaken: null,
  draft: {
    to: "client@example.com",
    subject: "Re: Session next week",
    body: "Hi! Happy to help schedule that. How does Tuesday at 2pm work?",
    gmailDraftId: "draft_abc123",
    gmailThreadId: "thread_xyz",
  },
  needsApproval: true,
  conflicts: [],
  isVip: false,
  vipGroupName: null,
};

function blockText(blocks: KnownBlock[]): string {
  return JSON.stringify(blocks);
}

describe("buildApprovalMessage", () => {
  it("includes email metadata (fromEmail, subject)", () => {
    const blocks = buildApprovalMessage({
      response: baseResponse,
      fromEmail: "client@example.com",
      subject: "Session next week",
      venture: Venture.SMART_COLLEGE,
    });
    const text = blockText(blocks);
    expect(text).toContain("client@example.com");
    expect(text).toContain("Session next week");
  });

  it("includes the category", () => {
    const blocks = buildApprovalMessage({
      response: baseResponse,
      fromEmail: "client@example.com",
      subject: "Session next week",
      venture: Venture.SMART_COLLEGE,
    });
    const text = blockText(blocks);
    expect(text).toContain(CosCategory.CLIENT_PARENT);
  });

  it("includes the venture name", () => {
    const blocks = buildApprovalMessage({
      response: baseResponse,
      fromEmail: "client@example.com",
      subject: "Session next week",
      venture: Venture.SMART_COLLEGE,
    });
    const text = blockText(blocks);
    expect(text).toContain(Venture.SMART_COLLEGE);
  });

  it("includes VIP indicator when isVip is true", () => {
    const vipResponse = {
      ...baseResponse,
      isVip: true,
      vipGroupName: "Top Clients",
    };
    const blocks = buildApprovalMessage({
      response: vipResponse,
      fromEmail: "vip@example.com",
      subject: "VIP request",
      venture: Venture.PRAXIS,
    });
    const text = blockText(blocks);
    expect(text).toContain("VIP");
  });

  it("does not include VIP indicator when isVip is false", () => {
    const blocks = buildApprovalMessage({
      response: baseResponse,
      fromEmail: "regular@example.com",
      subject: "Regular request",
      venture: Venture.PERSONAL,
    });
    const text = blockText(blocks);
    expect(text).not.toContain("VIP");
  });

  it("includes approve, edit, and reject action buttons", () => {
    const blocks = buildApprovalMessage({
      response: baseResponse,
      fromEmail: "client@example.com",
      subject: "Session next week",
      venture: Venture.SMART_COLLEGE,
    });
    const text = blockText(blocks);
    expect(text).toContain("cos_approve");
    expect(text).toContain("cos_edit");
    expect(text).toContain("cos_reject");
  });

  it("includes the summary", () => {
    const blocks = buildApprovalMessage({
      response: baseResponse,
      fromEmail: "client@example.com",
      subject: "Session next week",
      venture: Venture.SMART_COLLEGE,
    });
    const text = blockText(blocks);
    expect(text).toContain(
      "Client asking about scheduling a session next week.",
    );
  });

  it("includes draft preview when draft is present", () => {
    const blocks = buildApprovalMessage({
      response: baseResponse,
      fromEmail: "client@example.com",
      subject: "Session next week",
      venture: Venture.SMART_COLLEGE,
    });
    const text = blockText(blocks);
    expect(text).toContain("Happy to help schedule that");
  });

  it("includes conflicts when present", () => {
    const responseWithConflicts = {
      ...baseResponse,
      conflicts: [
        {
          title: "Team Meeting",
          calendar: "Work",
          start: "2026-03-25T14:00:00Z",
          end: "2026-03-25T15:00:00Z",
        },
      ],
    };
    const blocks = buildApprovalMessage({
      response: responseWithConflicts,
      fromEmail: "client@example.com",
      subject: "Session next week",
      venture: Venture.SMART_COLLEGE,
    });
    const text = blockText(blocks);
    expect(text).toContain("Team Meeting");
  });
});

describe("buildAutoHandleMessage", () => {
  it("shows a checkmark and action taken", () => {
    const blocks = buildAutoHandleMessage({
      summary: "Scheduled tutoring session for next Tuesday.",
      actionTaken: "Created calendar event and sent confirmation.",
    });
    const text = blockText(blocks);
    expect(text).toContain("Created calendar event and sent confirmation.");
    expect(text).toContain("Scheduled tutoring session for next Tuesday.");
  });

  it("has no action buttons (no actions block)", () => {
    const blocks = buildAutoHandleMessage({
      summary: "Auto-handled notification email.",
      actionTaken: "Archived email.",
    });
    const hasActions = blocks.some((b) => b.type === "actions");
    expect(hasActions).toBe(false);
  });
});

describe("buildBatchParentMessage", () => {
  it("includes the email count", () => {
    const blocks = buildBatchParentMessage(5);
    const text = blockText(blocks);
    expect(text).toContain("5");
  });

  it("includes a header mentioning Chief of Staff", () => {
    const blocks = buildBatchParentMessage(3);
    const text = blockText(blocks);
    expect(text).toContain("Chief of Staff");
  });
});

describe("buildFlagOnlyMessage", () => {
  it("includes an urgent marker", () => {
    const blocks = buildFlagOnlyMessage({
      fromEmail: "urgent@example.com",
      subject: "URGENT: Need response now",
      summary: "Client needs immediate assistance.",
      venture: Venture.PRAXIS,
    });
    const text = blockText(blocks);
    // Should contain some urgency indicator
    expect(text.toLowerCase()).toMatch(/urgent|🚨|alert|flag/i);
  });

  it("includes email metadata", () => {
    const blocks = buildFlagOnlyMessage({
      fromEmail: "urgent@example.com",
      subject: "URGENT: Need response now",
      summary: "Client needs immediate assistance.",
      venture: Venture.PRAXIS,
    });
    const text = blockText(blocks);
    expect(text).toContain("urgent@example.com");
    expect(text).toContain("URGENT: Need response now");
  });

  it("has no action buttons", () => {
    const blocks = buildFlagOnlyMessage({
      fromEmail: "urgent@example.com",
      subject: "URGENT: Need response now",
      summary: "Client needs immediate assistance.",
      venture: Venture.PRAXIS,
    });
    const hasActions = blocks.some((b) => b.type === "actions");
    expect(hasActions).toBe(false);
  });
});
