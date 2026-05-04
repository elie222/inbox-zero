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

vi.mock("@/utils/gmail/retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/gmail/retry")>();

  return {
    ...actual,
    withGmailRetry: (...args: unknown[]) => withGmailRetryMock(...args),
  };
});

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
    const stopMock = vi.fn().mockResolvedValue({});
    const watchMock = vi.fn().mockResolvedValue({
      data: { expiration: "123" },
    });
    const gmail = {
      users: {
        stop: stopMock,
        watch: watchMock,
      },
    } as any;

    await expect(watchGmail(gmail)).resolves.toEqual({
      expiration: "123",
    });

    expect(withGmailRetryMock).toHaveBeenCalledTimes(1);
    expect(stopMock).not.toHaveBeenCalled();
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
    const stopMock = vi.fn().mockResolvedValue({});
    const watchMock = vi.fn().mockResolvedValue({
      data: { expiration: "123" },
    });
    const gmail = {
      users: {
        stop: stopMock,
        watch: watchMock,
      },
    } as any;

    await expect(watchGmail(gmail)).resolves.toEqual({
      expiration: "123",
    });

    expect(withGmailRetryMock).toHaveBeenCalledTimes(1);
    expect(stopMock).not.toHaveBeenCalled();
    expect(watchMock).toHaveBeenCalledTimes(1);
  });

  it("stops the existing Gmail watch and retries when another push client blocks setup", async () => {
    const duplicatePushClientError = Object.assign(
      new Error(
        "Only one user push notification client allowed per developer (call /stop then try again)",
      ),
      { status: 400 },
    );
    const stopMock = vi.fn().mockResolvedValue({});
    const watchMock = vi
      .fn()
      .mockRejectedValueOnce(duplicatePushClientError)
      .mockResolvedValueOnce({
        data: { expiration: "123" },
      });
    const gmail = {
      users: {
        stop: stopMock,
        watch: watchMock,
      },
    } as any;

    await expect(watchGmail(gmail)).resolves.toEqual({
      expiration: "123",
    });

    expect(withGmailRetryMock).toHaveBeenCalledTimes(3);
    expect(stopMock).toHaveBeenCalledWith({ userId: "me" });
    expect(watchMock).toHaveBeenCalledTimes(2);
    expect(watchMock.mock.invocationCallOrder[0]).toBeLessThan(
      stopMock.mock.invocationCallOrder[0],
    );
    expect(stopMock.mock.invocationCallOrder[0]).toBeLessThan(
      watchMock.mock.invocationCallOrder[1],
    );
  });
});
