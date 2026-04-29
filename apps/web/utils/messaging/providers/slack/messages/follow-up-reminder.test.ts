import { describe, expect, it } from "vitest";
import { ThreadTrackerType } from "@/generated/prisma/enums";
import { buildFollowUpReminderBlocks } from "./follow-up-reminder";

const baseAwaitingParams = {
  subject: "Quote follow-up",
  counterpartyName: "Test Counterparty",
  counterpartyEmail: "test@example.com",
  trackerType: ThreadTrackerType.AWAITING,
  daysSinceSent: 4,
  snippet: "Following up on the proposal we sent last week.",
  threadLink: "https://mail.example.com/thread/awaiting",
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
  it("AWAITING: surfaces direction (they haven't replied) in the message", () => {
    const json = blocksJson(baseAwaitingParams);
    expect(json).toContain("they haven't replied");
    expect(json).not.toContain("you haven't replied");
  });

  it("NEEDS_REPLY: surfaces direction (you haven't replied) in the message", () => {
    const json = blocksJson(baseNeedsReplyParams);
    expect(json).toContain("you haven't replied");
    expect(json).not.toContain("they haven't replied");
  });

  it("renders the counterparty name and email together", () => {
    const json = blocksJson(baseAwaitingParams);
    expect(json).toContain("Test Counterparty");
    expect(json).toContain("test@example.com");
  });

  it("AWAITING: prefixes the counterparty with 'to'", () => {
    const json = blocksJson(baseAwaitingParams);
    expect(json).toContain("to ");
    expect(json).not.toContain("from Test Counterparty");
  });

  it("NEEDS_REPLY: prefixes the counterparty with 'from'", () => {
    const json = blocksJson(baseNeedsReplyParams);
    expect(json).toContain("from ");
    expect(json).not.toContain("to Test Counterparty");
  });

  it("renders 'sent N days ago' for AWAITING", () => {
    const json = blocksJson(baseAwaitingParams);
    expect(json).toContain("sent 4 days ago");
  });

  it("renders 'received N day ago' for NEEDS_REPLY (singular)", () => {
    const json = blocksJson(baseNeedsReplyParams);
    expect(json).toContain("received 1 day ago");
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
});
