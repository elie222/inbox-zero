import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    APNS_ENVIRONMENT: "sandbox",
    APNS_TOPIC: "com.getinboxzero.app",
    APNS_TRANSPORT: "fake",
    NODE_ENV: "test",
  },
}));

import { deliverApnsNotifications, takeRecordedApnsSends } from "./apns";

describe("deliverApnsNotifications", () => {
  beforeEach(() => {
    takeRecordedApnsSends();
  });

  it("records a fake APNs send without contacting Apple", async () => {
    const result = await deliverApnsNotifications({
      tokens: ["a".repeat(64)],
      notification: {
        title: "Verification code",
        body: "123456",
        data: { type: "otp", url: "/thread/1" },
      },
      logger: { warn: vi.fn() } as never,
    });

    expect(result).toEqual({ unregisteredTokens: [], retryTokens: [] });
    expect(takeRecordedApnsSends()).toEqual([
      {
        token: "a".repeat(64),
        topic: "com.getinboxzero.app",
        sandbox: true,
        payload: {
          aps: {
            alert: { title: "Verification code", body: "123456" },
            sound: "default",
          },
          type: "otp",
          url: "/thread/1",
        },
      },
    ]);
  });
});
