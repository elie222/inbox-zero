import { describe, expect, it } from "vitest";
import { findAssigneeReply, toHtmlParagraphs } from "@/utils/task-follow-up";
import type { ParsedMessage } from "@/utils/types";

const LAST_FOLLOW_UP = new Date("2026-07-29T09:00:00Z");

function message({
  id,
  from,
  at,
}: {
  id: string;
  from: string;
  at: string;
}): ParsedMessage {
  return {
    id,
    threadId: "thread1",
    snippet: "snippet",
    internalDate: at,
    headers: { from, to: "me@nucar.com", subject: "Checking in", date: at },
  } as unknown as ParsedMessage;
}

describe("findAssigneeReply", () => {
  const assigneeEmail = "dana@nucar.com";

  it("returns the newest assignee message after the last follow-up", () => {
    const reply = findAssigneeReply({
      messages: [
        message({
          id: "own-follow-up",
          from: "Me <me@nucar.com>",
          at: "2026-07-29T09:00:00Z",
        }),
        message({
          id: "older-reply",
          from: "Dana Fields <dana@nucar.com>",
          at: "2026-07-29T10:00:00Z",
        }),
        message({
          id: "newest-reply",
          from: "Dana Fields <dana@nucar.com>",
          at: "2026-07-29T15:00:00Z",
        }),
      ],
      assigneeEmail,
      since: LAST_FOLLOW_UP,
    });
    expect(reply?.id).toBe("newest-reply");
  });

  it("ignores messages from before the last follow-up and from others", () => {
    const reply = findAssigneeReply({
      messages: [
        message({
          id: "stale-reply",
          from: "Dana Fields <dana@nucar.com>",
          at: "2026-07-28T10:00:00Z",
        }),
        message({
          id: "someone-else",
          from: "Ray Chen <ray@chemstation.com>",
          at: "2026-07-29T15:00:00Z",
        }),
      ],
      assigneeEmail,
      since: LAST_FOLLOW_UP,
    });
    expect(reply).toBeUndefined();
  });

  it("finds nothing before the first follow-up goes out", () => {
    const reply = findAssigneeReply({
      messages: [
        message({
          id: "reply",
          from: "dana@nucar.com",
          at: "2026-07-29T15:00:00Z",
        }),
      ],
      assigneeEmail,
      since: null,
    });
    expect(reply).toBeUndefined();
  });
});

describe("toHtmlParagraphs", () => {
  it("splits paragraphs, keeps line breaks, escapes markup", () => {
    expect(toHtmlParagraphs("Hi Dana,\n\nAny update?\nThanks <3")).toBe(
      "<p>Hi Dana,</p><p>Any update?<br/>Thanks &lt;3</p>",
    );
  });
});
