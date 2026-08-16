import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

export const HISTORY_RULE_ID = "playwright-automation-history-rule";
export const HISTORY_RULE_NAME = "Playwright history archive";
export const HISTORY_EXECUTED_RULE_ID =
  "playwright-automation-history-execution";
export const KNOWLEDGE_TITLE = "Playwright product context";
export const UPDATED_KNOWLEDGE_TITLE = "Playwright customer context";

export type AutomationSettingsCleanup = Awaited<
  ReturnType<typeof seedAutomationSettings>
> & {
  emailAccountId: string;
};

export async function getAutomationEmailAccountId(page: Page) {
  const response = await page.request.get("/api/user/email-accounts");
  expect(response.ok()).toBeTruthy();
  const { emailAccounts } = (await response.json()) as {
    emailAccounts: { id: string }[];
  };
  const emailAccountId = emailAccounts[0]?.id;
  if (!emailAccountId) throw new Error("The setup project created no account");
  return emailAccountId;
}

export async function markAutomationOnboardingViewed(page: Page) {
  await page.goto("/");
  await page.context().addCookies([
    {
      name: "viewed_assistant_onboarding",
      value: "true",
      url: new URL(page.url()).origin,
    },
  ]);
}

export function getAutomationSettingsCard(page: Page, name: string) {
  return page
    .getByRole("heading", { name, exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'group/card')][1]");
}

export async function seedAutomationHistory(emailAccountId: string) {
  await withClient(async (client) => {
    await deleteAutomationHistory(client);
    await client.query(
      `INSERT INTO "Rule"
         (id, name, enabled, automate, "runOnThreads", instructions,
          "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, $2, true, true, false, $3, $4,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        HISTORY_RULE_ID,
        HISTORY_RULE_NAME,
        "Archive routine project updates",
        emailAccountId,
      ],
    );
    await client.query(
      `INSERT INTO "ExecutedRule"
         (id, "threadId", "messageId", status, automated, reason, "ruleId",
          "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, 'thr_playwright_1', 'msg_playwright_1', 'APPLIED', false,
               $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        HISTORY_EXECUTED_RULE_ID,
        "The message is a routine project update.",
        HISTORY_RULE_ID,
        emailAccountId,
      ],
    );
    await client.query(
      `INSERT INTO "ExecutedAction"
         (id, type, "executionStatus", "executedAt", "executedRuleId",
          "createdAt", "updatedAt")
       VALUES ($1, 'ARCHIVE', 'SUCCEEDED', CURRENT_TIMESTAMP, $2,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [`${HISTORY_EXECUTED_RULE_ID}-archive`, HISTORY_EXECUTED_RULE_ID],
    );
  });
}

export async function cleanupAutomationHistory() {
  await withClient(deleteAutomationHistory);
}

export async function seedAutomationSettings(emailAccountId: string) {
  return withClient(async (client) => {
    const existingRule = await client.query<{ id: string }>(
      `SELECT id FROM "Rule"
       WHERE "emailAccountId" = $1 AND "systemType" = 'TO_REPLY'`,
      [emailAccountId],
    );
    const createdToReplyRule = existingRule.rowCount === 0;
    const toReplyRuleId =
      existingRule.rows[0]?.id ??
      `playwright-automation-to-reply-${emailAccountId}`;

    if (createdToReplyRule) {
      await client.query(
        `INSERT INTO "Rule"
           (id, name, enabled, automate, "runOnThreads", instructions,
            "systemType", "emailAccountId", "createdAt", "updatedAt")
         VALUES ($1, 'To Reply', true, true, false,
                 'Emails that need a response', 'TO_REPLY', $2,
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [toReplyRuleId, emailAccountId],
      );
    } else {
      await client.query(
        `UPDATE "Rule" SET enabled = true, "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [toReplyRuleId],
      );
    }

    await client.query(
      `DELETE FROM "Action" WHERE "ruleId" = $1 AND type = 'DRAFT_EMAIL'`,
      [toReplyRuleId],
    );
    await client.query(
      `DELETE FROM "Knowledge"
       WHERE "emailAccountId" = $1 AND title IN ($2, $3)`,
      [emailAccountId, KNOWLEDGE_TITLE, UPDATED_KNOWLEDGE_TITLE],
    );
    await client.query(
      `UPDATE "EmailAccount"
       SET about = NULL,
           "writingStyle" = NULL,
           signature = NULL,
           "includeReferralSignature" = false,
           "multiRuleSelectionEnabled" = false,
           "sensitiveDataPolicy" = NULL,
           "draftReplyConfidence" = 'ALL_EMAILS',
           "allowHiddenAiDraftLinks" = false,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [emailAccountId],
    );

    return { createdToReplyRule, toReplyRuleId };
  });
}

export async function cleanupAutomationSettings({
  createdToReplyRule,
  emailAccountId,
  toReplyRuleId,
}: {
  createdToReplyRule: boolean;
  emailAccountId: string;
  toReplyRuleId: string;
}) {
  await withClient(async (client) => {
    await client.query(
      `DELETE FROM "Knowledge"
       WHERE "emailAccountId" = $1 AND title IN ($2, $3)`,
      [emailAccountId, KNOWLEDGE_TITLE, UPDATED_KNOWLEDGE_TITLE],
    );
    if (createdToReplyRule) {
      await client.query(`DELETE FROM "Rule" WHERE id = $1`, [toReplyRuleId]);
    } else {
      await client.query(
        `DELETE FROM "Action" WHERE "ruleId" = $1 AND type = 'DRAFT_EMAIL'`,
        [toReplyRuleId],
      );
    }
    await client.query(
      `UPDATE "EmailAccount"
       SET about = NULL,
           "writingStyle" = NULL,
           signature = NULL,
           "includeReferralSignature" = false,
           "multiRuleSelectionEnabled" = false,
           "sensitiveDataPolicy" = NULL,
           "draftReplyConfidence" = 'ALL_EMAILS',
           "allowHiddenAiDraftLinks" = false,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [emailAccountId],
    );
  });
}

export async function getAutomationSettingsState(emailAccountId: string) {
  return withClient(async (client) => {
    const accountResult = await client.query<{
      about: string | null;
      allowHiddenAiDraftLinks: boolean;
      draftReplyConfidence: string;
      includeReferralSignature: boolean;
      multiRuleSelectionEnabled: boolean;
      sensitiveDataPolicy: string | null;
    }>(
      `SELECT about,
              "allowHiddenAiDraftLinks",
              "draftReplyConfidence"::text,
              "includeReferralSignature",
              "multiRuleSelectionEnabled",
              "sensitiveDataPolicy"
       FROM "EmailAccount" WHERE id = $1`,
      [emailAccountId],
    );
    const draftActions = await client.query<{ type: string }>(
      `SELECT a.type::text
       FROM "Action" a
       JOIN "Rule" r ON r.id = a."ruleId"
       WHERE r."emailAccountId" = $1 AND r."systemType" = 'TO_REPLY'
       ORDER BY a.type::text`,
      [emailAccountId],
    );

    return {
      ...accountResult.rows[0],
      draftActionTypes: draftActions.rows.map((row) => row.type),
    };
  });
}

export async function getKnowledgeState(emailAccountId: string) {
  return withClient(async (client) => {
    const result = await client.query<{ content: string; title: string }>(
      `SELECT title, content FROM "Knowledge"
       WHERE "emailAccountId" = $1 AND title IN ($2, $3)
       LIMIT 1`,
      [emailAccountId, KNOWLEDGE_TITLE, UPDATED_KNOWLEDGE_TITLE],
    );
    return result.rows[0];
  });
}

async function deleteAutomationHistory(client: Client) {
  await client.query(`DELETE FROM "ExecutedRule" WHERE id = $1`, [
    HISTORY_EXECUTED_RULE_ID,
  ]);
  await client.query(`DELETE FROM "Rule" WHERE id = $1`, [HISTORY_RULE_ID]);
}

async function withClient<T>(callback: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}
