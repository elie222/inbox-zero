import { describe, expect, it } from "vitest";
import { ThreadTrackerType } from "@/generated/prisma/enums";
import { FOLLOW_UP_MARK_DONE_ACTION_ID } from "@/utils/follow-up/follow-up-actions";
import { buildFollowUpReminderBlocks } from "./follow-up-reminder";

const baseAwaitingParams = {
  subject: "Quote follow-up",
  counterpartyName: "Test Counterparty",
  counterpartyEmail: "test@example.com",
  trackerType: ThreadTrackerType.AWAITING,
  daysSinceSent: 4,
  snippet: "Following up on the proposal we sent last week.",
  threadLink: "https://mail.example.com/thread/awaiting",
  threadLinkLabel: "Open in Gmail",
  trackerId: "tracker-abc123",
};

const baseNeedsReplyParams = {
  ...baseAwaitingParams,
  trackerType: ThreadTrackerType.NEEDS_REPLY,
  daysSinceSent: 1,
  snippet: "Could you share pricing details when you get a chance?",
  threadLink: "https://mail.example.com/thread/needs-reply",
};

function blocksJson(params: Parameters<typeof buildFollowUpReminderBlocks>[0]) {
  return JSON.stringify(buildFollowUpReminderBlocks(params));
}

describe("buildFollowUpReminderBlocks", () => {
  it("AWAITING: makes clear the user sent the email and is waiting for a reply", () => {
    const json = blocksJson(baseAwaitingParams);
    expect(json).toContain("Waiting for their reply to your sent email");
    expect(json).toContain("You sent this email to");
    expect(json).toContain("Your sent email:");
    expect(json).not.toContain("You haven't replied to this email yet");
  });

  it("NEEDS_REPLY: makes clear the user received the email and has not replied", () => {
    const json = blocksJson(baseNeedsReplyParams);
    expect(json).toContain("You haven't replied to this email yet");
    expect(json).toContain("You received this email from");
    expect(json).toContain("Email awaiting your reply:");
    expect(json).not.toContain("Waiting for their reply to your sent email");
  });

  it("renders the counterparty name and email together", () => {
    const json = blocksJson(baseAwaitingParams);
    expect(json).toContain("Test Counterparty");
    expect(json).toContain("test@example.com");
  });

  it("AWAITING: identifies the counterparty as the recipient", () => {
    const json = blocksJson(baseAwaitingParams);
    expect(json).toContain("You sent this email to *Test Counterparty*");
    expect(json).not.toContain("You received this email from");
  });

  it("NEEDS_REPLY: identifies the counterparty as the sender", () => {
    const json = blocksJson(baseNeedsReplyParams);
    expect(json).toContain("You received this email from *Test Counterparty*");
    expect(json).not.toContain("You sent this email to");
  });

  it("renders elapsed time for AWAITING", () => {
    const json = blocksJson(baseAwaitingParams);
    expect(json).toContain("4 days ago");
  });

  it("renders singular elapsed time for NEEDS_REPLY", () => {
    const json = blocksJson(baseNeedsReplyParams);
    expect(json).toContain("1 day ago");
  });

  it("includes the message snippet so the user knows what the thread is about", () => {
    const json = blocksJson(baseAwaitingParams);
    expect(json).toContain("Following up on the proposal we sent last week.");
  });

  it("omits the snippet block when no snippet is provided", () => {
    const json = blocksJson({ ...baseAwaitingParams, snippet: undefined });
    expect(json).not.toContain("Following up on");
  });

  it("renders the subject as the headline", () => {
    const json = blocksJson(baseAwaitingParams);
    expect(json).toContain("Quote follow-up");
  });

  it("includes the thread link as an action button", () => {
    const json = blocksJson(baseAwaitingParams);
    expect(json).toContain("https://mail.example.com/thread/awaiting");
    expect(json).toContain("Open in Gmail");
    expect(json).not.toContain("Open thread");
  });

  it("renders a Mark done button carrying the tracker id", () => {
    const blocks = buildFollowUpReminderBlocks(baseAwaitingParams);
    const buttons = blocks.flatMap((block) =>
      block.type === "actions" && Array.isArray((block as any).elements)
        ? (block as any).elements
        : [],
    );
    const markDone = buttons.find(
      (el: any) =>
        el?.type === "button" &&
        el?.action_id === FOLLOW_UP_MARK_DONE_ACTION_ID,
    );
    expect(markDone).toBeDefined();
    expect(markDone.text.text).toBe("Mark done");
    expect(markDone.value).toBe("tracker-abc123");
  });

  it("renders the Mark done button even without a thread link", () => {
    const blocks = buildFollowUpReminderBlocks({
      ...baseAwaitingParams,
      threadLink: undefined,
    });
    const json = JSON.stringify(blocks);
    expect(json).toContain(FOLLOW_UP_MARK_DONE_ACTION_ID);
    expect(json).toContain("Mark done");
  });

  it("escapes Slack-sensitive characters in subject, name, and snippet", () => {
    const json = blocksJson({
      ...baseAwaitingParams,
      subject: "Q1 <plan> & review",
      counterpartyName: "A&B Partners",
      snippet: "<script> tag in body",
    });
    expect(json).toContain("Q1 &lt;plan&gt; &amp; review");
    expect(json).toContain("A&amp;B Partners");
    expect(json).toContain("&lt;script&gt; tag in body");
  });

  it("decodes email HTML entities before escaping for Slack", () => {
    const json = blocksJson({
      ...baseAwaitingParams,
      subject: "Status &amp; next steps",
      snippet: "If it&#39;s still missing, send a screenshot.",
    });
    expect(json).toContain("Status &amp; next steps");
    expect(json).toContain("If it's still missing, send a screenshot.");
    expect(json).not.toContain("it&amp;#39;s");
    expect(json).not.toContain("it&#39;s");
  });
});
