import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock, withGmailRetryMock } = vi.hoisted(() => ({
  envMock: {
    GOOGLE_PUBSUB_TOPIC_NAME: "projects/test/topics/inbox-zero",
    GOOGLE_PUBSUB_VERIFICATION_TOKEN: "test-google-webhook-token" as
      | string
      | undefined,
  },
  withGmailRetryMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/gmail/retry", () => ({
  withGmailRetry: (...args: unknown[]) => withGmailRetryMock(...args),
}));

import { watchGmail } from "./watch";

describe("watchGmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.GOOGLE_PUBSUB_VERIFICATION_TOKEN = "test-google-webhook-token";
    withGmailRetryMock.mockImplementation((operation: () => Promise<unknown>) =>
      operation(),
    );
  });

  it("requires a verification token before registering the watch", async () => {
    envMock.GOOGLE_PUBSUB_VERIFICATION_TOKEN = undefined;
    const watchMock = vi.fn();
    const gmail = {
      users: {
        watch: watchMock,
      },
    } as any;

    await expect(watchGmail(gmail)).rejects.toThrow(
      "GOOGLE_PUBSUB_VERIFICATION_TOKEN is required to watch Gmail",
    );

    expect(watchMock).not.toHaveBeenCalled();
    expect(withGmailRetryMock).not.toHaveBeenCalled();
  });

  it("registers the watch when the verification token is configured", async () => {
    const watchMock = vi.fn().mockResolvedValue({
      data: { expiration: "123" },
    });
    const gmail = {
      users: {
        watch: watchMock,
      },
    } as any;

    await expect(watchGmail(gmail)).resolves.toEqual({
      expiration: "123",
    });

    expect(withGmailRetryMock).toHaveBeenCalledTimes(1);
    expect(watchMock).toHaveBeenCalledWith({
      userId: "me",
      requestBody: {
        labelIds: ["INBOX", "SENT"],
        labelFilterBehavior: "include",
        topicName: "projects/test/topics/inbox-zero",
      },
    });
  });

  it("allows intentionally-empty verification tokens", async () => {
    envMock.GOOGLE_PUBSUB_VERIFICATION_TOKEN = "";
    const watchMock = vi.fn().mockResolvedValue({
      data: { expiration: "123" },
    });
    const gmail = {
      users: {
        watch: watchMock,
      },
    } as any;

    await expect(watchGmail(gmail)).resolves.toEqual({
      expiration: "123",
    });

    expect(withGmailRetryMock).toHaveBeenCalledTimes(1);
    expect(watchMock).toHaveBeenCalledTimes(1);
  });
});
