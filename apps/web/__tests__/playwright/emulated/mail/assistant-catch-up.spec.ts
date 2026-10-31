import { expect, type Page } from "@playwright/test";
import type { Client } from "pg";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { isMicrosoftPlaywright } from "../mail-provider";
import {
  conversationWithSubject,
  insertInboxMailInConversation,
  openMail,
  withClient,
} from "./mail-test-helpers";

const THREAD_ID = "thr_playwright_archive";
const MESSAGE_ID = "msg_playwright_archive";
const SUBJECT = "Archive Action Message";
const RULE_ID = "playwright-mail-assistant-archive-rule";
const PREMIUM_ID = `${RULE_ID}-premium`;
const ARRIVAL_SUBJECT = "Assistant catch-up processing example";

test("applies assistant archive after the mail client was stopped", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(page, conversations, SUBJECT);
  await expect(conversation).toHaveCount(1);
  await waitForMetadataCoverage(page);

  await page.goto("about:blank");

  const cleanupErrors: unknown[] = [];
  const account = await readProviderAccount(emailAccountId);
  let insertedMessageId: string | undefined;
  try {
    await seedAssistantArchive(emailAccountId);
    await withClient(async (client) => {
      await client.query(
        `INSERT INTO "Premium"
        (id, "createdAt", "updatedAt", "pendingInvites", tier, "adminGrantTier", "adminGrantExpiresAt")
        VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ARRAY[]::text[],
          'PLUS_MONTHLY', 'PLUS_MONTHLY', CURRENT_TIMESTAMP + INTERVAL '1 day')`,
        [PREMIUM_ID],
      );
      await client.query(
        `UPDATE "User" SET "premiumId" = $2
        WHERE id = (SELECT "userId" FROM "EmailAccount" WHERE id = $1)`,
        [emailAccountId, PREMIUM_ID],
      );
    });
    const before = await readProviderPosition(page, account.access_token);
    await withClient((client) =>
      client.query(
        `UPDATE "EmailAccount" SET "lastSyncedHistoryId" = $2,
       "watchEmailsSubscriptionId" = $3 WHERE id = $1`,
        [emailAccountId, before, RULE_ID],
      ),
    );
    insertedMessageId = await insertInboxMailInConversation(page, {
      threadId: THREAD_ID,
      messageId: MESSAGE_ID,
      subject: ARRIVAL_SUBJECT,
      from: "assistant-fixture@example.com",
    });
    await deliverWebhook(page, account.access_token, insertedMessageId);
    await expect
      .poll(
        () =>
          withClient(async (client) => {
            const result = await client.query(
              `SELECT action."executionStatus" FROM "ExecutedAction" action
         JOIN "ExecutedRule" execution ON execution.id = action."executedRuleId"
         WHERE execution."ruleId" = $1 AND execution."messageId" = $2
         AND action.type = 'ARCHIVE'`,
              [RULE_ID, insertedMessageId],
            );
            return result.rows.map((row) => row.executionStatus);
          }),
        { timeout: 60_000 },
      )
      .toEqual(["SUCCEEDED"]);
    await expect
      .poll(
        () => providerMessageIsInInbox(page, account.access_token, MESSAGE_ID),
        { timeout: 60_000 },
      )
      .toBe(false);

    let assistantStateCalls = 0;
    await page.route(
      "**/api/mail/v1/accounts/**/assistant-state**",
      async (route) => {
        assistantStateCalls += 1;
        await route.continue();
      },
    );

    const reopened = await openMail(page);
    await expect(
      reopened.conversations.getByRole("option").first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      conversationWithSubject(page, reopened.conversations, SUBJECT),
    ).toHaveCount(0, { timeout: 60_000 });
    await expect
      .poll(() => readAssistantCatchUp(page), { timeout: 60_000 })
      .toEqual(
        expect.objectContaining({
          assistantCursor: expect.stringMatching(/\S/),
          inboxRole: false,
        }),
      );
    expect(assistantStateCalls).toBeGreaterThan(0);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "assistant-catch-up-archived",
    );
  } finally {
    if (insertedMessageId) {
      const base = isMicrosoftPlaywright()
        ? process.env.MICROSOFT_BASE_URL
        : process.env.GOOGLE_BASE_URL;
      const resource = isMicrosoftPlaywright()
        ? "v1.0/me/messages"
        : "gmail/v1/users/me/messages";
      await page.request
        .delete(`${base}/${resource}/${insertedMessageId}`, {
          headers: { Authorization: `Bearer ${account.access_token}` },
        })
        .then((response) => expect(response.ok()).toBe(true))
        .catch((error) => cleanupErrors.push(error));
    }
    await withClient((client) =>
      client.query(
        `UPDATE "EmailAccount" SET "lastSyncedHistoryId" = $2,
       "watchEmailsSubscriptionId" = $3 WHERE id = $1`,
        [
          emailAccountId,
          account.lastSyncedHistoryId,
          account.watchEmailsSubscriptionId,
        ],
      ),
    ).catch((error) => cleanupErrors.push(error));
    await page.request
      .post(`/api/threads/${THREAD_ID}/unarchive`, {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
    await withClient(async (client) => {
      await client.query(
        `UPDATE "User" SET "premiumId" = $2
        WHERE id = (SELECT "userId" FROM "EmailAccount" WHERE id = $1)`,
        [emailAccountId, account.premiumId],
      );
      await client.query(`DELETE FROM "Premium" WHERE id = $1`, [PREMIUM_ID]);
    }).catch((error) => cleanupErrors.push(error));
    await cleanupAssistantArchive().catch((error) => {
      cleanupErrors.push(error);
    });
    for (const error of cleanupErrors) {
      testInfo.annotations.push({
        type: "cleanup-error",
        description: String(error),
      });
    }
  }
  expect(cleanupErrors).toEqual([]);
});

async function waitForMetadataCoverage(page: Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const seam = window.__inboxZeroMailInspect;
          if (!seam) return { present: false, coverageComplete: false };
          const diagnostics = (await seam.read()) as {
            coverage?: Array<{ metadata: string }>;
          };
          return {
            present: true,
            coverageComplete:
              (diagnostics.coverage?.length ?? 0) > 0 &&
              diagnostics.coverage?.every(
                (item) => item.metadata === "complete",
              ),
          };
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({ present: true, coverageComplete: true });
}

async function readAssistantCatchUp(page: Page) {
  try {
    return await page.evaluate(async (messageId) => {
      const seam = window.__inboxZeroMailInspect;
      if (!seam?.inspect) return;
      const snapshot = (await seam.inspect()) as {
        accounts?: Array<{ assistantCursor: string | null }>;
        messages?: Array<{
          messageId: string;
          confirmed: { roles: string[] };
        }>;
      };
      const message = snapshot.messages?.find(
        (item) => item.messageId === messageId,
      );
      return {
        assistantCursor: snapshot.accounts?.[0]?.assistantCursor ?? null,
        inboxRole: message?.confirmed.roles.includes("inbox") ?? false,
      };
    }, MESSAGE_ID);
  } catch (error) {
    if (String(error).includes("Execution context was destroyed")) return;
    throw error;
  }
}

async function seedAssistantArchive(emailAccountId: string) {
  await withClient(async (client) => {
    await deleteAssistantArchive(client);
    await client.query(
      `INSERT INTO "Rule"
         (id, name, enabled, automate, "runOnThreads", subject,
          "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, $2, true, true, true, $3, $4,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        RULE_ID,
        "Playwright mail assistant archive",
        ARRIVAL_SUBJECT,
        emailAccountId,
      ],
    );
    await client.query(
      `INSERT INTO "Action" (id, type, "ruleId", "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, 'ARCHIVE', $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [`${RULE_ID}-action`, RULE_ID, emailAccountId],
    );
  });
}

async function cleanupAssistantArchive() {
  await withClient(deleteAssistantArchive);
}

async function deleteAssistantArchive(client: Client) {
  await client.query(`DELETE FROM "ExecutedRule" WHERE "ruleId" = $1`, [
    RULE_ID,
  ]);
  await client.query(`DELETE FROM "Rule" WHERE id = $1`, [RULE_ID]);
}

async function readProviderAccount(emailAccountId: string) {
  return withClient(async (client) => {
    const result = await client.query<{
      access_token: string;
      premiumId: string | null;
      lastSyncedHistoryId: string | null;
      watchEmailsSubscriptionId: string | null;
    }>(
      `SELECT account.access_token, email."lastSyncedHistoryId", email."watchEmailsSubscriptionId", app_user."premiumId"
        FROM "EmailAccount" email JOIN "Account" account ON account.id = email."accountId"
        JOIN "User" app_user ON app_user.id = email."userId"
        WHERE email.id = $1`,
      [emailAccountId],
    );
    if (!result.rows[0]?.access_token)
      throw new Error("Missing emulator account");
    return result.rows[0];
  });
}

async function readProviderPosition(page: Page, token: string) {
  if (isMicrosoftPlaywright()) return null;
  const response = await page.request.get(
    `${process.env.GOOGLE_BASE_URL}/gmail/v1/users/me/profile`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  expect(response.ok()).toBe(true);
  return String((await response.json()).historyId);
}

async function deliverWebhook(page: Page, token: string, messageId: string) {
  const microsoft = isMicrosoftPlaywright();
  const endpoint = microsoft
    ? "/api/outlook/webhook"
    : `/api/google/webhook?token=${encodeURIComponent(process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN ?? "playwright-token")}`;
  const data = microsoft
    ? {
        value: [
          {
            subscriptionId: RULE_ID,
            clientState:
              process.env.MICROSOFT_WEBHOOK_CLIENT_STATE ??
              "playwright-microsoft-webhook",
            changeType: "created",
            resourceData: { id: messageId },
          },
        ],
      }
    : {
        message: {
          data: Buffer.from(
            JSON.stringify({
              emailAddress: process.env.PLAYWRIGHT_TEST_EMAIL,
              historyId: await readProviderPosition(page, token),
            }),
          ).toString("base64"),
        },
      };
  const response = await page.request.post(endpoint, { data });
  expect(response.ok(), await response.text()).toBe(true);
}

async function providerMessageIsInInbox(
  page: Page,
  token: string,
  messageId: string,
) {
  const microsoft = isMicrosoftPlaywright();
  const base = microsoft
    ? process.env.MICROSOFT_BASE_URL
    : process.env.GOOGLE_BASE_URL;
  const resource = microsoft
    ? "v1.0/me/messages"
    : "gmail/v1/users/me/messages";
  const headers = { Authorization: `Bearer ${token}` };
  const response = await page.request.get(`${base}/${resource}/${messageId}`, {
    headers,
  });
  expect(response.ok(), await response.text()).toBe(true);
  const message = await response.json();
  if (!microsoft) return message.labelIds.includes("INBOX");
  const inbox = await page.request.get(`${base}/v1.0/me/mailFolders/inbox`, {
    headers,
  });
  expect(inbox.ok()).toBe(true);
  return message.parentFolderId === (await inbox.json()).id;
}
