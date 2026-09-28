import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { followMailboxSignal } from "../../../desktop/src/mail-engine/mailbox-signals";
import { ApnsEnvironment } from "@/generated/prisma/enums";
import { takeRecordedApnsSends } from "@/utils/apns";
import {
  createGmailTestHarness,
  createOutlookTestHarness,
  type GmailTestHarness,
  type OutlookTestHarness,
} from "./helpers";

const execute = promisify(execFile);
const REDIS_URL = "redis://127.0.0.1:36379";
const CONTAINER = "mailbox-change-push-redis";
const DEVICE_A = "a".repeat(64);
const DEVICE_B = "b".repeat(64);
const GMAIL_ACCOUNT = "account-gmail";
const OUTLOOK_CREATED_ACCOUNT = "account-outlook-created";
const OUTLOOK_MOVED_ACCOUNT = "account-outlook-moved";
const GMAIL_EMAIL = "gmail-push@example.com";
const OUTLOOK_EMAIL = "outlook-push@example.com";

const redisState = vi.hoisted(() => {
  process.env.REDIS_URL = "redis://127.0.0.1:36379";
  process.env.APNS_TRANSPORT = "fake";
  process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN = "test-google-webhook-token";
  process.env.MICROSOFT_WEBHOOK_CLIENT_STATE = "mailbox-push-state";
  return {
    client: null as import("ioredis").default | null,
  };
});

const accountLookup = vi.hoisted(() => ({
  getWebhookEmailAccount: vi.fn(),
}));

const pendingAfter = vi.hoisted(() => ({
  tasks: [] as Promise<unknown>[],
}));

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (fn: () => void | Promise<void>) => {
      const task = Promise.resolve().then(() => fn());
      pendingAfter.tasks.push(task);
      return task;
    },
  };
});

vi.mock("@/utils/redis", () => ({
  redis: {
    exists: (key: string) => redisState.client!.exists(key),
    get: (key: string) => redisState.client!.get(key),
    del: (key: string) => redisState.client!.del(key),
    publish: (channel: string, message: string) =>
      redisState.client!.publish(channel, message),
    set: (
      key: string,
      value: string,
      options?: { nx?: boolean; ex?: number },
    ) => {
      const client = redisState.client!;
      if (options?.nx) {
        return client.set(key, value, "EX", options.ex ?? 1, "NX");
      }
      if (options?.ex) return client.set(key, value, "EX", options.ex);
      return client.set(key, value);
    },
  },
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    mobilePushToken: {
      findMany: vi.fn(async () => [
        { token: DEVICE_A, environment: ApnsEnvironment.SANDBOX },
        { token: DEVICE_B, environment: ApnsEnvironment.PRODUCTION },
      ]),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/utils/webhook/validate-webhook-account", () => ({
  getWebhookEmailAccount: (...args: unknown[]) =>
    accountLookup.getWebhookEmailAccount(...args),
  cleanupWebhookAccountOnRateLimitSkip: vi.fn(),
}));

vi.mock("@/utils/webhook/google/process-history", () => ({
  processHistoryForUser: vi.fn(async () => undefined),
}));

vi.mock("@/utils/webhook/outlook/process-history", () => ({
  processHistoryForUser: vi.fn(async () => undefined),
}));

vi.mock("@/utils/middleware", async () => {
  const actual =
    await vi.importActual<typeof import("@/utils/middleware")>(
      "@/utils/middleware",
    );
  const { createWithAuthTestMiddleware } = await import("@/__tests__/helpers");
  return { ...actual, ...createWithAuthTestMiddleware() };
});

import { POST as postGoogleWebhook } from "@/app/api/google/webhook/route";
import { POST as postOutlookWebhook } from "@/app/api/outlook/webhook/route";
import { GET as getMailStream } from "@/app/api/mail-stream/route";

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
  "mailbox change push",
  { timeout: 60_000 },
  () => {
    let gmail: GmailTestHarness;
    let outlook: OutlookTestHarness;
    let createdMessageId = "";
    let movedMessageId = "";

    beforeAll(async () => {
      await execute("docker", ["rm", "--force", CONTAINER]).catch(
        () => undefined,
      );
      await execute("docker", [
        "run",
        "--detach",
        "--name",
        CONTAINER,
        "--publish",
        "36379:6379",
        "redis:7",
        "redis-server",
        "--save",
        "",
        "--appendonly",
        "no",
      ]);
      const Redis = (await import("ioredis")).default;
      redisState.client = new Redis(REDIS_URL, { maxRetriesPerRequest: 2 });
      await vi.waitFor(() => redisState.client!.ping());

      gmail = await createGmailTestHarness({
        email: GMAIL_EMAIL,
        messages: [
          {
            id: "gmail-push-message",
            user_email: GMAIL_EMAIL,
            from: "ada@example.com",
            to: GMAIL_EMAIL,
            subject: "New mail",
            body_text: "Hello",
            label_ids: ["INBOX", "UNREAD"],
            internal_date: "1711900000000",
          },
        ],
      });
      outlook = await createOutlookTestHarness({
        email: OUTLOOK_EMAIL,
        folders: [{ id: "archive", display_name: "Archive" }],
        messages: [
          {
            microsoft_id: "outlook-created",
            user_email: OUTLOOK_EMAIL,
            from: { address: "ada@example.com" },
            to_recipients: [{ address: OUTLOOK_EMAIL }],
            subject: "Created",
            body_content: "Hello",
            parent_folder_id: "inbox",
            is_read: false,
            received_date_time: "2026-09-28T12:00:00Z",
          },
          {
            microsoft_id: "outlook-moved",
            user_email: OUTLOOK_EMAIL,
            from: { address: "ada@example.com" },
            to_recipients: [{ address: OUTLOOK_EMAIL }],
            subject: "Move me",
            body_content: "Hello",
            parent_folder_id: "inbox",
            is_read: true,
            received_date_time: "2026-09-28T12:05:00Z",
          },
        ],
      });
      const listed = await outlook.graphClient.api("/me/messages").get();
      const created = listed.value.find(
        (message: { subject: string }) => message.subject === "Created",
      );
      const toMove = listed.value.find(
        (message: { subject: string; id: string }) =>
          message.subject === "Move me",
      );
      createdMessageId = created.id;
      const moved = await outlook.graphClient
        .api(`/me/messages/${toMove.id}/move`)
        .post({ destinationId: "archive" });
      movedMessageId = moved.id;
    });

    afterAll(async () => {
      await redisState.client?.quit();
      await execute("docker", ["rm", "--force", CONTAINER]).catch(
        () => undefined,
      );
      outlook?.restoreFetch();
      await outlook?.emulator.close();
      await gmail?.emulator.close();
    });

    beforeEach(async () => {
      takeRecordedApnsSends();
      pendingAfter.tasks.length = 0;
      await redisState.client?.flushdb();
      accountLookup.getWebhookEmailAccount.mockImplementation(
        async (query: {
          email?: string;
          watchEmailsSubscriptionId?: string;
        }) => {
          if (query.email === GMAIL_EMAIL) return { id: GMAIL_ACCOUNT };
          if (query.watchEmailsSubscriptionId === "sub-created") {
            return { id: OUTLOOK_CREATED_ACCOUNT };
          }
          if (query.watchEmailsSubscriptionId === "sub-moved") {
            return { id: OUTLOOK_MOVED_ACCOUNT };
          }
          return null;
        },
      );
    });

    it("sends one silent push per device for a Gmail webhook and suppresses the next", async () => {
      const message = await gmail.gmailClient.users.messages.get({
        userId: "me",
        id: "gmail-push-message",
      });
      expect(message.data.id).toBe("gmail-push-message");

      const response = await postGoogleWebhook(
        gmailWebhook(message.data.historyId),
      );
      expect(response.status).toBe(200);
      await flushAfter();
      expect(
        await redisState.client!.exists(
          `mailbox-push-cooldown:${GMAIL_ACCOUNT}`,
        ),
      ).toBe(1);

      expect(silentSends(GMAIL_ACCOUNT)).toEqual([
        expect.objectContaining({ token: DEVICE_A, sandbox: true }),
        expect.objectContaining({ token: DEVICE_B, sandbox: false }),
      ]);

      const repeat = await postGoogleWebhook(
        gmailWebhook(message.data.historyId),
      );
      expect(repeat.status).toBe(200);
      await flushAfter();
      expect(
        await redisState.client!.exists(
          `mailbox-push-cooldown:${GMAIL_ACCOUNT}`,
        ),
      ).toBe(1);
      expect(takeRecordedApnsSends()).toEqual([]);
    });

    it("sends one silent push per device for an Outlook create and a move", async () => {
      expect(createdMessageId).toBeTruthy();
      expect(movedMessageId).toBeTruthy();

      const created = await postOutlookWebhook(
        outlookWebhook("sub-created", "created", createdMessageId),
      );
      expect(created.status).toBe(200);
      await flushAfter();
      expect(silentSends(OUTLOOK_CREATED_ACCOUNT)).toHaveLength(2);

      const moved = await postOutlookWebhook(
        outlookWebhook("sub-moved", "updated", movedMessageId),
      );
      expect(moved.status).toBe(200);
      await flushAfter();
      expect(silentSends(OUTLOOK_MOVED_ACCOUNT)).toHaveLength(2);
    });

    it("delivers mailbox-change to the desktop client after a webhook", async () => {
      await redisState.client!.set(
        `account:user-1:${GMAIL_ACCOUNT}`,
        GMAIL_EMAIL,
      );
      const changes: string[] = [];
      const abort = new AbortController();
      const following = followMailboxSignal({
        origin: "http://localhost",
        accountId: GMAIL_ACCOUNT,
        cookieHeader: () => "",
        signal: abort.signal,
        onChange: () => {
          changes.push(GMAIL_ACCOUNT);
        },
        fetchImpl: async (url, init) =>
          getMailStream(
            new NextRequest(url, {
              headers: init?.headers,
              signal: init?.signal ?? undefined,
            }),
          ),
      });

      try {
        await vi.waitFor(async () => {
          expect(
            await redisState.client!.exists(
              `local-mail-interest:${GMAIL_ACCOUNT}`,
            ),
          ).toBe(1);
        });
        const response = await postGoogleWebhook(gmailWebhook("2"));
        expect(response.status).toBe(200);
        await flushAfter();
        await vi.waitFor(() => expect(changes).toEqual([GMAIL_ACCOUNT]));
      } finally {
        abort.abort();
        await following;
      }
    });
  },
);

function silentSends(emailAccountId: string) {
  return takeRecordedApnsSends().map((send) => {
    expect(send.payload).toEqual({
      aps: { "content-available": 1 },
      emailAccountId,
      hint: "mailbox",
    });
    return send;
  });
}

// The webhook must not await after(), so drain the queued callbacks here.
async function flushAfter() {
  while (pendingAfter.tasks.length > 0) {
    const batch = pendingAfter.tasks.splice(0, pendingAfter.tasks.length);
    await Promise.all(batch);
  }
}

function gmailWebhook(historyId: string | null | undefined) {
  const data = Buffer.from(
    JSON.stringify({
      emailAddress: GMAIL_EMAIL,
      historyId: historyId ?? "1",
    }),
  ).toString("base64url");
  return new NextRequest(
    "http://localhost/api/google/webhook?token=test-google-webhook-token",
    {
      method: "POST",
      body: JSON.stringify({ message: { data, messageId: "m1" } }),
    },
  );
}

function outlookWebhook(
  subscriptionId: string,
  changeType: string,
  messageId: string,
) {
  return new NextRequest("http://localhost/api/outlook/webhook", {
    method: "POST",
    body: JSON.stringify({
      value: [
        {
          subscriptionId,
          clientState: "mailbox-push-state",
          changeType,
          resourceData: { id: messageId },
        },
      ],
    }),
  });
}
