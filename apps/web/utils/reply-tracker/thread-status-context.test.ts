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

  it("uses larger limits for the first and latest messages", () => {
    const messages = Array.from({ length: 3 }, (_, index) =>
      getMockMessage({ id: `msg-${index + 1}` }),
    );

    const result = buildThreadStatusMessagesForLLM(messages as any);

    expect(result.map((message) => message.id)).toEqual([
      "msg-1",
      "msg-2",
      "msg-3",
    ]);
    expect(getEmailForLLM).toHaveBeenNthCalledWith(
      1,
      messages[0],
      expect.objectContaining({ maxLength: 500 }),
    );
    expect(getEmailForLLM).toHaveBeenNthCalledWith(
      2,
      messages[1],
      expect.objectContaining({ maxLength: 500 }),
    );
    expect(getEmailForLLM).toHaveBeenNthCalledWith(
      3,
      messages[2],
      expect.objectContaining({ maxLength: 2000 }),
    );
  });

  it("keeps all messages and compresses the middle of long threads", () => {
    const messages = Array.from({ length: 12 }, (_, index) =>
      getMockMessage({ id: `msg-${index + 1}` }),
    );

    const result = buildThreadStatusMessagesForLLM(messages as any);

    expect(result.map((message) => message.id)).toEqual([
      "msg-1",
      "msg-2",
      "msg-3",
      "msg-4",
      "msg-5",
      "msg-6",
      "msg-7",
      "msg-8",
      "msg-9",
      "msg-10",
      "msg-11",
      "msg-12",
    ]);
    expect(getEmailForLLM).toHaveBeenCalledTimes(12);
    expect(getEmailForLLM).toHaveBeenNthCalledWith(
      1,
      messages[0],
      expect.objectContaining({ maxLength: 500 }),
    );
    expect(getEmailForLLM).toHaveBeenNthCalledWith(
      2,
      messages[1],
      expect.objectContaining({ maxLength: 120 }),
    );
    expect(getEmailForLLM).toHaveBeenNthCalledWith(
      5,
      messages[4],
      expect.objectContaining({ maxLength: 500 }),
    );
    expect(getEmailForLLM).toHaveBeenNthCalledWith(
      6,
      messages[5],
      expect.objectContaining({ maxLength: 500 }),
    );
    expect(getEmailForLLM).toHaveBeenNthCalledWith(
      12,
      messages[11],
      expect.objectContaining({ maxLength: 2000 }),
    );
  });
});
