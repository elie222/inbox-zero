import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import { isRuleGeneratedMessage } from "@/utils/ai/rule-generated-message";
import type { EmailProvider, EmailThread } from "@/utils/email/types";
import { hasUserSentEmail } from "./has-user-sent-email";

vi.mock("@/utils/ai/rule-generated-message", () => ({
  isRuleGeneratedMessage: vi.fn(),
}));

const sender = "contact@outside.example";
const provider = {
  getThreadsWithQuery: vi.fn<EmailProvider["getThreadsWithQuery"]>(),
  isSentMessage: vi.fn<EmailProvider["isSentMessage"]>(),
};
const options = { provider, sender, emailAccountId: "account-id" };

describe("hasUserSentEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    provider.isSentMessage.mockReturnValue(true);
    vi.mocked(isRuleGeneratedMessage).mockResolvedValue(false);
  });

  it("does not treat an automatic rule reply as a relationship", async () => {
    provider.getThreadsWithQuery.mockResolvedValue({ threads: [getThread()] });
    vi.mocked(isRuleGeneratedMessage).mockResolvedValue(true);

    expect(await hasUserSentEmail(options)).toBe(false);
  });

  it("finds a personal reply after automatic replies on an earlier page", async () => {
    provider.getThreadsWithQuery
      .mockResolvedValueOnce({ threads: [getThread()], nextPageToken: "next" })
      .mockResolvedValueOnce({ threads: [getThread()] });
    vi.mocked(isRuleGeneratedMessage)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    expect(await hasUserSentEmail(options)).toBe(true);
  });

  it("ignores incoming messages and sent mail to another recipient in matching threads", async () => {
    const thread = getThread();
    thread.messages.push(
      getMockMessage({ id: "other", to: "other@outside.example" }),
    );
    provider.getThreadsWithQuery.mockResolvedValue({ threads: [thread] });
    provider.isSentMessage.mockReturnValueOnce(false).mockReturnValue(true);

    expect(await hasUserSentEmail(options)).toBe(false);
    expect(isRuleGeneratedMessage).not.toHaveBeenCalled();
  });

  it("recognizes a recipient in Cc with different casing", async () => {
    const thread = getThread();
    thread.messages[0].headers.to = "other@outside.example";
    thread.messages[0].headers.cc = "Contact <CONTACT@OUTSIDE.EXAMPLE>";
    provider.getThreadsWithQuery.mockResolvedValue({ threads: [thread] });

    expect(await hasUserSentEmail(options)).toBe(true);
  });

  it("bounds recovery instead of trusting a long history of automatic replies", async () => {
    provider.getThreadsWithQuery.mockResolvedValue({
      threads: [getThread()],
      nextPageToken: "more",
    });
    vi.mocked(isRuleGeneratedMessage).mockResolvedValue(true);

    expect(await hasUserSentEmail(options)).toBe(false);
    expect(provider.getThreadsWithQuery).toHaveBeenCalledTimes(3);
  });
});

function getThread(): EmailThread {
  return {
    id: "thread-id",
    snippet: "",
    messages: [getMockMessage({ id: "sent-message", to: sender })],
  };
}
