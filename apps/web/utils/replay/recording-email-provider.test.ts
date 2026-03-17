import { describe, expect, it, vi } from "vitest";
import type { EmailProvider } from "@/utils/email/types";
import { createRecordingEmailProvider } from "./recording-email-provider";

describe("createRecordingEmailProvider", () => {
  it("preserves synchronous provider methods", () => {
    const session = {
      record: vi.fn().mockResolvedValue(undefined),
    } as any;
    const provider = {
      isSentMessage: vi.fn(() => true),
      name: "google",
    } as unknown as EmailProvider;

    const wrapped = createRecordingEmailProvider(provider, session);
    const result = wrapped.isSentMessage({} as any);

    expect(result).toBe(true);
    expect(provider.isSentMessage).toHaveBeenCalledTimes(1);
    expect(session.record).toHaveBeenCalledWith("email-api-call", {
      method: "isSentMessage",
      request: [{}],
    });
  });

  it("preserves asynchronous provider methods", async () => {
    const session = {
      record: vi.fn().mockResolvedValue(undefined),
    } as any;
    const provider = {
      getAccessToken: vi.fn(() => "token"),
      getMessage: vi.fn(async () => ({ id: "message-1" })),
      name: "google",
    } as unknown as EmailProvider;

    const wrapped = createRecordingEmailProvider(provider, session);
    const result = await wrapped.getMessage("message-1");

    expect(result).toEqual({ id: "message-1" });
    expect(provider.getMessage).toHaveBeenCalledWith("message-1");
    expect(session.record).toHaveBeenCalledWith("email-api-call", {
      method: "getMessage",
      request: ["message-1"],
    });
    expect(session.record).toHaveBeenCalledWith("email-api-response", {
      method: "getMessage",
      request: null,
      response: { id: "message-1" },
      duration: expect.any(Number),
    });
  });
});
