import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { buildThreadStatusMessagesForLLM } from "@/utils/reply-tracker/thread-status-context";

vi.mock("@/utils/get-email-from-message", () => ({
  getEmailForLLM: vi.fn(),
}));

describe("buildThreadStatusMessagesForLLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEmailForLLM).mockImplementation((message) => ({
      id: message.id,
      from: message.headers.from,
      to: message.headers.to,
      subject: message.headers.subject,
      content: message.textPlain || "",
    }));
  });

  it("keeps the full thread when it is already within the limit", () => {
    const messages = Array.from({ length: 3 }, (_, index) =>
      getMockMessage({ id: `msg-${index + 1}` }),
    );

    const result = buildThreadStatusMessagesForLLM(messages as any);

    expect(result.omittedMessageCount).toBe(0);
    expect(result.threadMessages.map((message) => message.id)).toEqual([
      "msg-1",
      "msg-2",
      "msg-3",
    ]);
    expect(getEmailForLLM).toHaveBeenNthCalledWith(
      1,
      messages[0],
      expect.objectContaining({ maxLength: 300 }),
    );
    expect(getEmailForLLM).toHaveBeenNthCalledWith(
      2,
      messages[1],
      expect.objectContaining({ maxLength: 300 }),
    );
    expect(getEmailForLLM).toHaveBeenNthCalledWith(
      3,
      messages[2],
      expect.objectContaining({ maxLength: 2000 }),
    );
  });

  it("keeps the first message and the recent tail when the thread is long", () => {
    const messages = Array.from({ length: 12 }, (_, index) =>
      getMockMessage({ id: `msg-${index + 1}` }),
    );

    const result = buildThreadStatusMessagesForLLM(messages as any);

    expect(result.omittedMessageCount).toBe(4);
    expect(result.threadMessages.map((message) => message.id)).toEqual([
      "msg-1",
      "msg-6",
      "msg-7",
      "msg-8",
      "msg-9",
      "msg-10",
      "msg-11",
      "msg-12",
    ]);
    expect(getEmailForLLM).toHaveBeenCalledTimes(8);
    expect(getEmailForLLM).toHaveBeenNthCalledWith(
      8,
      messages[11],
      expect.objectContaining({ maxLength: 2000 }),
    );
  });
});
