/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import type { StoredMailMutation } from "@/utils/email-cache/database";
import { getOutboxReplyMessage } from "./outbox-reply";

describe("getOutboxReplyMessage", () => {
  it.each([
    "pending",
    "processing",
    "succeeded",
    "failed",
    "uncertain",
  ] as const)("keeps the submitted reply visible while delivery is %s", (status) => {
    const message = getOutboxReplyMessage(
      { ...reply, status },
      ["original-message"],
      "sender@example.com",
    );
    expect(message?.textHtml).toBe("<p>Reply body</p>");
    expect(message?.headers).toMatchObject({
      from: "sender@example.com",
      to: "recipient@example.com",
      cc: "copy@example.com",
    });
  });

  it("replaces the local copy only when its provider message is present", () => {
    const sent = {
      ...reply,
      status: "succeeded" as const,
      result: { messageId: "sent-message", threadId: reply.threadId },
    };
    expect(
      getOutboxReplyMessage(sent, ["original-message"], "sender@example.com"),
    ).toBeDefined();
    expect(
      getOutboxReplyMessage(sent, ["sent-message"], "sender@example.com"),
    ).toBeUndefined();
  });

  it("does not leave a sent forward in the original thread", () => {
    expect(
      getOutboxReplyMessage(
        {
          ...reply,
          status: "succeeded",
          result: { messageId: "sent-message", threadId: "other-thread" },
        },
        [],
        "sender@example.com",
      ),
    ).toBeUndefined();
  });

  it("renders inline images from the submitted attachment bytes", () => {
    const message = getOutboxReplyMessage(
      {
        ...reply,
        payload: {
          email: {
            ...reply.payload.email,
            messageHtml: '<p>Reply<img src="cid:image@example.com"></p>',
            attachments: [
              {
                filename: "image.png",
                contentType: "image/png",
                content: "aW1hZ2U=",
                disposition: "inline",
                contentId: "image@example.com",
              },
            ],
          },
        },
      },
      [],
      "sender@example.com",
    );
    expect(message?.textHtml).toContain('src="data:image/png;base64,aW1hZ2U="');
  });
});

const reply = {
  id: "queued-reply",
  batchId: "batch",
  emailAccountId: "account",
  threadId: "thread",
  messageIds: ["original-message"],
  kind: "reply",
  status: "pending",
  attempts: 0,
  nextAttemptAt: 0,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  payload: {
    email: {
      to: "recipient@example.com",
      cc: "copy@example.com",
      subject: "Re: Message",
      messageHtml: "<p>Reply body</p>",
    },
  },
} satisfies StoredMailMutation;
