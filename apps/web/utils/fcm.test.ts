import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    FCM_TRANSPORT: "fake" as string | undefined,
    FCM_PROJECT_ID: "inbox-zero-test" as string | undefined,
    FCM_SERVICE_ACCOUNT_JSON: undefined as string | undefined,
  },
}));

vi.mock("@/env", () => ({ env: envMock }));

import {
  deliverFcmNotifications,
  isFcmConfigured,
  takeRecordedFcmSends,
} from "./fcm";

const logger = createTestLogger();
const token = "fcm-token:APA91b".padEnd(152, "x");

describe("deliverFcmNotifications", () => {
  beforeEach(() => {
    envMock.FCM_TRANSPORT = "fake";
    envMock.FCM_PROJECT_ID = "inbox-zero-test";
    envMock.FCM_SERVICE_ACCOUNT_JSON = undefined;
    takeRecordedFcmSends();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("folds the subtitle into the notification body", async () => {
    await deliverFcmNotifications({
      tokens: ["test-token"],
      notification: {
        title: "Alex",
        subtitle: "Project plan",
        body: "Please review the plan.",
      },
      logger,
    });
    expect(takeRecordedFcmSends()[0]?.message.notification).toEqual({
      title: "Alex",
      body: "Project plan\nPlease review the plan.",
    });
  });

  it("records a silent mailbox hint as a normal-priority data message", async () => {
    const result = await deliverFcmNotifications({
      tokens: [token],
      notification: {
        pushType: "background",
        data: { emailAccountId: "account-1", hint: "mailbox" },
      },
      logger,
    });

    expect(result).toEqual({ unregisteredTokens: [], retryTokens: [] });
    expect(takeRecordedFcmSends()).toEqual([
      {
        token,
        projectId: "inbox-zero-test",
        message: {
          token,
          data: { emailAccountId: "account-1", hint: "mailbox" },
          android: { priority: "NORMAL" },
        },
      },
    ]);
  });

  it("records a visible alert on the mail channel at high priority", async () => {
    await deliverFcmNotifications({
      tokens: [token],
      notification: {
        title: "Alice",
        body: "Quarterly plan",
        data: { threadId: "thread-1", emailAccountId: "account-1" },
      },
      logger,
    });

    expect(takeRecordedFcmSends()).toEqual([
      {
        token,
        projectId: "inbox-zero-test",
        message: {
          token,
          notification: { title: "Alice", body: "Quarterly plan" },
          data: { threadId: "thread-1", emailAccountId: "account-1" },
          android: {
            priority: "HIGH",
            notification: { channel_id: "mail", sound: "default" },
          },
        },
      },
    ]);
  });

  it("keeps an OTP alert on its channel and expires it with the code", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00.000Z"));

    await deliverFcmNotifications({
      tokens: [token],
      notification: {
        title: "Verification code",
        body: "123456",
        channelId: "otp",
        expiration: new Date("2026-07-31T12:15:00.000Z").getTime() / 1000,
      },
      logger,
    });

    expect(takeRecordedFcmSends()[0]?.message.android).toEqual({
      priority: "HIGH",
      ttl: "900s",
      notification: { channel_id: "otp", sound: "default" },
    });
  });

  it("prunes unregistered tokens and retries tokens FCM could not take yet", async () => {
    useRealTransport();
    const sent: Array<{ url: string; body: unknown; auth: string | null }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "access-1", expires_in: 3600 });
      }
      const body = JSON.parse(String(init?.body));
      sent.push({
        url,
        body,
        auth: new Headers(init?.headers).get("authorization"),
      });
      if (body.message.token === "stale") {
        return Response.json(
          {
            error: {
              code: 404,
              status: "NOT_FOUND",
              details: [
                {
                  "@type":
                    "type.googleapis.com/google.firebase.fcm.v1.FcmError",
                  errorCode: "UNREGISTERED",
                },
              ],
            },
          },
          { status: 404 },
        );
      }
      if (body.message.token === "wrong-project") {
        return Response.json(
          { error: { code: 404, status: "NOT_FOUND" } },
          { status: 404 },
        );
      }
      if (body.message.token === "busy") {
        return Response.json(
          { error: { code: 503, status: "UNAVAILABLE" } },
          { status: 503 },
        );
      }
      return Response.json({ name: "projects/inbox-zero-test/messages/1" });
    });

    const result = await deliverFcmNotifications({
      tokens: ["ok", "stale", "wrong-project", "busy"],
      notification: { title: "Alice", body: "Hello" },
      logger,
    });

    expect(result).toEqual({
      unregisteredTokens: ["stale"],
      retryTokens: ["busy"],
    });
    expect(new Set(sent.map(({ url }) => url))).toEqual(
      new Set([
        "https://fcm.googleapis.com/v1/projects/inbox-zero-test/messages:send",
      ]),
    );
    expect(sent).toHaveLength(4);
    expect(sent.every(({ auth }) => auth === "Bearer access-1")).toBe(true);
  });

  it("retries every token when the real transport has no credentials", async () => {
    envMock.FCM_TRANSPORT = undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(isFcmConfigured()).toBe(false);
    await expect(
      deliverFcmNotifications({
        tokens: [token],
        notification: { title: "Alice", body: "Hello" },
        logger,
      }),
    ).resolves.toEqual({ unregisteredTokens: [], retryTokens: [token] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function useRealTransport() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  envMock.FCM_TRANSPORT = undefined;
  envMock.FCM_PROJECT_ID = undefined;
  envMock.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "push@inbox-zero-test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    project_id: "inbox-zero-test",
  });
}
