import { describe, expect, it, vi } from "vitest";
import { getThreadsWithNextPageToken } from "@/utils/outlook/thread";
import type { OutlookClient } from "@/utils/outlook/client";
import type { Logger } from "@/utils/logger";

describe("getThreadsWithNextPageToken", () => {
  it("does not use opaque page tokens as Graph paths", async () => {
    const api = vi.fn().mockReturnValue(createMessagesRequest());

    await getThreadsWithNextPageToken({
      client: createOutlookClient(api),
      pageToken: "opaque-token",
      logger: createLogger(),
    });

    expect(api).toHaveBeenCalledWith("/me/messages");
  });

  it("rejects page tokens with embedded URLs before calling Graph", async () => {
    const api = vi.fn().mockReturnValue(createMessagesRequest());

    await expect(
      getThreadsWithNextPageToken({
        client: createOutlookClient(api),
        pageToken: "prefix-https://169.254.169.254/latest",
        logger: createLogger(),
      }),
    ).rejects.toThrow("Invalid Outlook page token");

    expect(api).not.toHaveBeenCalled();
  });
});

function createOutlookClient(api: ReturnType<typeof vi.fn>) {
  return {
    getClient: () => ({ api }),
  } as unknown as OutlookClient;
}

function createMessagesRequest() {
  const request = {
    top: vi.fn(() => request),
    select: vi.fn(() => request),
    filter: vi.fn(() => request),
    get: vi.fn().mockResolvedValue({ value: [] }),
  };
  return request;
}

function createLogger() {
  return {
    warn: vi.fn(),
  } as unknown as Logger;
}
