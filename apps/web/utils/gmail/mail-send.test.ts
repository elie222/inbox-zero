import type { gmail_v1 } from "@googleapis/gmail";
import { assert, describe, expect, it, vi } from "vitest";
import { sendEmailWithHtml } from "./mail";

vi.mock("@/utils/mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/mail")>()),
  ensureEmailSendingEnabled: vi.fn(),
}));

const email = {
  to: "recipient@example.com",
  subject: "Re: Question",
  messageHtml: "<p>Edited reply</p>",
  replyToEmail: {
    messageId: "draft-message",
    threadId: "thread-1",
    headerMessageId: "<draft@example.com>",
  },
};

describe("sending a Gmail draft from the reader", () => {
  it("consumes the existing draft and sends the edited content", async () => {
    const { gmail, drafts, messages } = createGmail();

    const result = await sendEmailWithHtml(gmail, email);

    expect(result.data).toEqual({ id: "sent-1", threadId: "thread-1" });
    expect(drafts.send).toHaveBeenCalledWith({
      userId: "me",
      requestBody: {
        id: "r-123",
        message: { threadId: "thread-1", raw: expect.any(String) },
      },
    });
    const call = drafts.send.mock.calls.at(0);
    assert.isDefined(call);
    const [request] = call;
    const raw = request.requestBody.message.raw;
    expect(Buffer.from(raw, "base64url").toString()).toContain("Edited reply");
    expect(messages.send).not.toHaveBeenCalled();
  });

  it("does not send a second copy when sending the draft fails ambiguously", async () => {
    const { gmail, drafts, messages } = createGmail();
    drafts.send.mockRejectedValue(
      Object.assign(new Error("Unavailable"), { code: 503 }),
    );

    await expect(sendEmailWithHtml(gmail, email)).rejects.toThrow(
      "Unavailable",
    );

    expect(drafts.send).toHaveBeenCalledTimes(1);
    expect(messages.send).not.toHaveBeenCalled();
  });

  it("does not send a separate message if the draft disappears during lookup", async () => {
    const { gmail, drafts, messages } = createGmail();
    drafts.list.mockResolvedValue({ data: { drafts: [] } });

    await expect(sendEmailWithHtml(gmail, email)).rejects.toThrow(/draft/i);

    expect(drafts.send).not.toHaveBeenCalled();
    expect(messages.send).not.toHaveBeenCalled();
  });

  it("does not resend a stale draft that is already marked sent", async () => {
    const { gmail, drafts, messages } = createGmail();
    messages.get.mockResolvedValue({ data: { labelIds: ["DRAFT", "SENT"] } });

    await expect(sendEmailWithHtml(gmail, email)).rejects.toThrow(
      /already.*sent/i,
    );

    expect(drafts.send).not.toHaveBeenCalled();
    expect(messages.send).not.toHaveBeenCalled();
  });

  it("does not send a new copy when the source draft message is already gone", async () => {
    const { gmail, drafts, messages } = createGmail();
    messages.get.mockRejectedValue(
      Object.assign(new Error("Not found"), { code: 404 }),
    );

    await expect(sendEmailWithHtml(gmail, email)).rejects.toThrow("Not found");

    expect(drafts.send).not.toHaveBeenCalled();
    expect(messages.send).not.toHaveBeenCalled();
  });

  it("sends ordinary replies without consuming another draft in the thread", async () => {
    const { gmail, drafts, messages } = createGmail();
    messages.get.mockResolvedValue({ data: { labelIds: ["INBOX"] } });

    await sendEmailWithHtml(gmail, email);

    expect(messages.send).toHaveBeenCalledTimes(1);
    expect(drafts.list).not.toHaveBeenCalled();
    expect(drafts.send).not.toHaveBeenCalled();
  });

  it("sends new messages without looking up a draft", async () => {
    const { gmail, drafts, messages } = createGmail();

    await sendEmailWithHtml(gmail, { ...email, replyToEmail: undefined });

    expect(messages.send).toHaveBeenCalledTimes(1);
    expect(messages.get).not.toHaveBeenCalled();
    expect(drafts.list).not.toHaveBeenCalled();
  });
});

function createGmail() {
  const sent = { data: { id: "sent-1", threadId: "thread-1" } };
  const messages = {
    get: vi.fn().mockResolvedValue({ data: { labelIds: ["DRAFT"] } }),
    send: vi.fn().mockResolvedValue(sent),
  };
  const drafts = {
    list: vi.fn().mockResolvedValue({
      data: { drafts: [{ id: "r-123", message: { id: "draft-message" } }] },
    }),
    send: vi
      .fn<
        (params: {
          userId: string;
          requestBody: {
            id: string;
            message: { threadId: string; raw: string };
          };
        }) => Promise<typeof sent>
      >()
      .mockResolvedValue(sent),
  };
  return {
    gmail: { users: { messages, drafts } } as unknown as gmail_v1.Gmail,
    messages,
    drafts,
  };
}
