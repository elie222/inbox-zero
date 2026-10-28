import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/env", () => ({
  env: {
    APNS_ENVIRONMENT: "sandbox",
    APNS_TOPIC: "com.getinboxzero.app",
    APNS_TRANSPORT: "fake",
    NODE_ENV: "test",
  },
}));

import {
  deliverApnsNotifications,
  isStaleApnsToken,
  takeRecordedApnsSends,
} from "./apns";

const logger = createTestLogger();

describe("deliverApnsNotifications", () => {
  beforeEach(() => {
    takeRecordedApnsSends();
  });

  it("maps the subtitle to the APNs alert", async () => {
    await deliverApnsNotifications({
      tokens: ["test-token"],
      notification: {
        title: "Alex",
        subtitle: "Project plan",
        body: "Please review the plan.",
      },
      logger,
    });
    expect(takeRecordedApnsSends()[0]?.payload).toMatchObject({
      aps: {
        alert: {
          title: "Alex",
          subtitle: "Project plan",
          body: "Please review the plan.",
        },
      },
    });
  });

  it("records a fake APNs send without contacting Apple", async () => {
    const result = await deliverApnsNotifications({
      tokens: ["a".repeat(64)],
      notification: {
        title: "Verification code",
        body: "123456",
        data: { type: "otp", url: "/thread/1" },
      },
      logger,
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

  it("records a silent background push with no alert", async () => {
    await deliverApnsNotifications({
      tokens: ["b".repeat(64)],
      sandbox: true,
      notification: {
        pushType: "background",
        data: { emailAccountId: "account-1", hint: "mailbox" },
      },
      logger,
    });

    expect(takeRecordedApnsSends()).toEqual([
      {
        token: "b".repeat(64),
        topic: "com.getinboxzero.app",
        sandbox: true,
        payload: {
          aps: { "content-available": 1 },
          emailAccountId: "account-1",
          hint: "mailbox",
        },
      },
    ]);
  });
});

describe("isStaleApnsToken", () => {
  it.each([
    { status: 410, reason: "Unregistered" },
    { status: 400, reason: "BadDeviceToken" },
  ])("prunes %j", (delivery) => {
    expect(isStaleApnsToken(delivery)).toBe(true);
  });

  it("keeps retryable rejections", () => {
    expect(isStaleApnsToken({ status: 429, reason: "TooManyRequests" })).toBe(
      false,
    );
  });
});
