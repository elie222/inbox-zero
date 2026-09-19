import { expect, type Page } from "@playwright/test";
import type { Client } from "pg";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  conversationWithSubject,
  openMail,
  withClient,
} from "./mail-test-helpers";

const THREAD_ID = "thr_playwright_archive";
const MESSAGE_ID = "msg_playwright_archive";
const SUBJECT = "Archive Action Message";
const RULE_ID = "playwright-mail-assistant-archive-rule";
const EXECUTED_RULE_ID = "playwright-mail-assistant-archive-execution";

test("applies assistant archive after the mail client was stopped", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(page, conversations, SUBJECT);
  await expect(conversation).toHaveCount(1);
  await waitForMetadataCoverage(page);

  await page.goto("about:blank");

  const cleanupErrors: unknown[] = [];
  try {
    await seedAssistantArchive(emailAccountId);
    const archived = await page.request.post(
      `/api/threads/${THREAD_ID}/archive`,
      { headers: { "X-Email-Account-ID": emailAccountId } },
    );
    expect(archived.ok()).toBe(true);

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
    await page.request
      .post(`/api/threads/${THREAD_ID}/unarchive`, {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
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
        inboxRole: message?.confirmed.roles.includes("inbox") ?? null,
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
         (id, name, enabled, automate, "runOnThreads", instructions,
          "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, $2, true, true, false, $3, $4,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        RULE_ID,
        "Playwright mail assistant archive",
        "Archive routine project updates",
        emailAccountId,
      ],
    );
    await client.query(
      `INSERT INTO "ExecutedRule"
         (id, "threadId", "messageId", status, automated, reason, "ruleId",
          "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'APPLIED', true, $4, $5, $6,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        EXECUTED_RULE_ID,
        THREAD_ID,
        MESSAGE_ID,
        "Assistant archived while the mail client was stopped.",
        RULE_ID,
        emailAccountId,
      ],
    );
    await client.query(
      `INSERT INTO "ExecutedAction"
         (id, type, "executionStatus", "executedAt", "executedRuleId",
          "createdAt", "updatedAt")
       VALUES ($1, 'ARCHIVE', 'SUCCEEDED', CURRENT_TIMESTAMP, $2,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [`${EXECUTED_RULE_ID}-archive`, EXECUTED_RULE_ID],
    );
  });
}

async function cleanupAssistantArchive() {
  await withClient(deleteAssistantArchive);
}

async function deleteAssistantArchive(client: Client) {
  await client.query(
    `DELETE FROM "ExecutedRule" WHERE id = $1 OR "ruleId" = $2`,
    [EXECUTED_RULE_ID, RULE_ID],
  );
  await client.query(`DELETE FROM "Rule" WHERE id = $1`, [RULE_ID]);
}
