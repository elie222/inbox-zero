/**
 * Integration test: a rule's archive that Gmail rate limits is completed on retry.
 *
 * A proxy in front of the Gmail emulator answers thread modifies with 429 while
 * the limit is on, so the first run saves a failed archive. Retrying must archive
 * the thread without repeating the label that already succeeded.
 *
 * Usage:
 *   pnpm test-integration rule-action-retry
 */

import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gmail, auth } from "@googleapis/gmail";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { createGmailTestHarness, type GmailTestHarness } from "./helpers";
import {
  ActionType,
  ExecutedActionStatus,
  ExecutedRuleStatus,
} from "@/generated/prisma/enums";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import { retryFailedRuleActions } from "@/utils/ai/choose-rule/retry-failed-actions";
import { GmailProvider } from "@/utils/email/google";

const { store } = vi.hoisted(() => ({
  store: {
    executedRule: null as null | Record<string, any>,
    actions: new Map<string, Record<string, any>>(),
  },
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    executedRule: {
      findUnique: async () =>
        store.executedRule && {
          ...store.executedRule,
          actionItems: [...store.actions.values()],
        },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(store.executedRule!, data);
        return store.executedRule;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status: string };
        data: Record<string, unknown>;
      }) => {
        if (
          store.executedRule?.id !== where.id ||
          store.executedRule.status !== where.status
        ) {
          return { count: 0 };
        }
        Object.assign(store.executedRule, data);
        return { count: 1 };
      },
    },
    scheduledAction: {
      count: async () => 0,
    },
    executedAction: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const action = store.actions.get(where.id)!;
        Object.assign(action, data);
        return action;
      },
      findFirst: async () => null,
    },
  },
}));

vi.mock("@inboxzero/tinybird", () => ({
  publishArchive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/log-error-with-dedupe", () => ({
  logErrorWithDedupe: vi.fn(),
}));

vi.mock("@/utils/encryption", () => ({
  encrypt: vi.fn((s: string) => s),
  decrypt: vi.fn((s: string) => s),
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const TEST_EMAIL = "retry-test@example.com";
const SEED_MESSAGE = {
  id: "msg_rate_limited",
  user_email: TEST_EMAIL,
  from: "newsletter@updates.com",
  to: TEST_EMAIL,
  subject: "Weekly digest",
  body_text: "Here is your weekly digest.",
  label_ids: ["INBOX", "UNREAD"],
  internal_date: "1711900060000",
};

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Retrying rule actions after a Gmail rate limit",
  { timeout: 30_000 },
  () => {
    let harness: GmailTestHarness;
    let proxy: Server;
    let rateLimitThreadModifies = false;
    let provider: GmailProvider;

    beforeAll(async () => {
      harness = await createGmailTestHarness({
        email: TEST_EMAIL,
        messages: [SEED_MESSAGE],
      });

      const emulatorUrl = new URL(harness.emulator.url);
      proxy = createServer((req, res) => {
        if (
          rateLimitThreadModifies &&
          req.method === "POST" &&
          /\/threads\/[^/]+\/modify$/.test(req.url ?? "")
        ) {
          res.writeHead(429, {
            "content-type": "application/json",
            "retry-after": "120",
          });
          res.end(
            JSON.stringify({
              error: {
                code: 429,
                message: "User-rate limit exceeded.",
                status: "RESOURCE_EXHAUSTED",
                errors: [{ reason: "rateLimitExceeded" }],
              },
            }),
          );
          return;
        }

        const upstream = request(
          {
            host: emulatorUrl.hostname,
            port: emulatorUrl.port,
            path: req.url,
            method: req.method,
            headers: req.headers,
          },
          (upstreamRes) => {
            res.writeHead(upstreamRes.statusCode ?? 500, upstreamRes.headers);
            upstreamRes.pipe(res);
          },
        );
        req.pipe(upstream);
      });
      await new Promise<void>((resolve) => proxy.listen(0, resolve));

      const oauth2Client = new auth.OAuth2(
        "test-client.apps.googleusercontent.com",
        "test-secret",
      );
      oauth2Client.setCredentials({ access_token: "emulator-token" });
      const proxiedClient = gmail({
        version: "v1",
        auth: oauth2Client,
        rootUrl: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`,
      });
      provider = new GmailProvider(
        proxiedClient,
        createTestLogger(),
        "test-account-id",
      );
    });

    afterAll(async () => {
      await new Promise((resolve) => proxy?.close(resolve));
      await harness?.emulator.close();
    });

    test("archives the email on retry and does not label it again", async () => {
      const threadId = harness.threadIds[SEED_MESSAGE.id];
      const emailAccount = {
        email: TEST_EMAIL,
        id: "test-account-id",
        userId: "test-user-id",
      };
      const message = {
        id: SEED_MESSAGE.id,
        threadId,
        headers: {
          from: SEED_MESSAGE.from,
          to: SEED_MESSAGE.to,
          subject: SEED_MESSAGE.subject,
          date: new Date(Number(SEED_MESSAGE.internal_date)).toISOString(),
          "message-id": `<${SEED_MESSAGE.id}@test>`,
        },
        textPlain: SEED_MESSAGE.body_text,
        snippet: SEED_MESSAGE.body_text,
        labelIds: SEED_MESSAGE.label_ids,
        internalDate: SEED_MESSAGE.internal_date,
        historyId: "1",
        subject: SEED_MESSAGE.subject,
        date: new Date(Number(SEED_MESSAGE.internal_date)).toISOString(),
        inline: [],
      };

      store.executedRule = {
        id: "executed-rule-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        messageId: message.id,
        threadId,
        automated: true,
        reason: "Matched newsletter rule",
        status: ExecutedRuleStatus.APPLYING,
        ruleId: "rule-1",
        emailAccountId: emailAccount.id,
      };
      for (const action of [
        { id: "label-action", type: ActionType.LABEL, label: "Newsletter" },
        { id: "archive-action", type: ActionType.ARCHIVE, label: null },
      ]) {
        store.actions.set(action.id, {
          ...action,
          executionStatus: null,
          executedRuleId: "executed-rule-1",
          labelId: null,
          draftId: null,
        });
      }

      rateLimitThreadModifies = true;
      await expect(
        executeAct({
          client: provider,
          executedRule: {
            ...store.executedRule,
            actionItems: [...store.actions.values()],
          } as Parameters<typeof executeAct>[0]["executedRule"],
          message,
          emailAccount,
          logger: createTestLogger(),
        }),
      ).rejects.toThrow();

      expect(store.executedRule.status).toBe(ExecutedRuleStatus.ERROR);
      expect(store.actions.get("archive-action")?.executionStatus).toBe(
        ExecutedActionStatus.FAILED,
      );
      expect(await getThreadLabelIds(threadId)).toContain("INBOX");

      rateLimitThreadModifies = false;
      const labelOutcomeBeforeRetry = {
        ...store.actions.get("label-action"),
      };

      const status = await retryFailedRuleActions({
        client: provider,
        executedRuleId: "executed-rule-1",
        message,
        emailAccount,
        logger: createTestLogger(),
      });

      expect(status).toBe(ExecutedRuleStatus.APPLIED);
      expect(await getThreadLabelIds(threadId)).not.toContain("INBOX");
      expect(store.actions.get("archive-action")?.executionStatus).toBe(
        ExecutedActionStatus.SUCCEEDED,
      );
      expect(store.actions.get("label-action")).toEqual(
        labelOutcomeBeforeRetry,
      );
    });

    async function getThreadLabelIds(threadId: string) {
      const thread = await harness.gmailClient.users.threads.get({
        userId: "me",
        id: threadId,
      });
      return thread.data.messages?.flatMap((m) => m.labelIds ?? []) ?? [];
    }
  },
);
