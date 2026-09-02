import { expect, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

export const HISTORY_RULE_ID = "playwright-automation-history-rule";
export const HISTORY_RULE_NAME = "Playwright history archive";
export const HISTORY_EXECUTED_RULE_ID =
  "playwright-automation-history-execution";
export const KNOWLEDGE_TITLE = "Playwright product context";
export const UPDATED_KNOWLEDGE_TITLE = "Playwright customer context";

type AutomationAccountSettings = {
  about: string | null;
  allowHiddenAiDraftLinks: boolean;
  draftReplyConfidence: string;
  includeReferralSignature: boolean;
  multiRuleSelectionEnabled: boolean;
  sensitiveDataPolicy: string | null;
  signature: string | null;
  writingStyle: string | null;
};

type DraftActionSnapshot = {
  bcc: string | null;
  cc: string | null;
  content: string | null;
  createdAt: Date;
  delayInMinutes: number | null;
  emailAccountId: string;
  folderId: string | null;
  folderName: string | null;
  id: string;
  integrationArgs: unknown;
  integrationName: string | null;
  integrationToolName: string | null;
  label: string | null;
  labelId: string | null;
  messagingChannelEmailAccountId: string | null;
  messagingChannelId: string | null;
  ruleId: string;
  staticAttachments: unknown;
  subject: string | null;
  to: string | null;
  type: string;
  updatedAt: Date;
  url: string | null;
};

export type AutomationSettingsCleanup = Awaited<
  ReturnType<typeof seedAutomationSettings>
> & {
  emailAccountId: string;
};

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

export async function expectVisibleAfterTransientFetch(
  page: Page,
  locator: Locator,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await expect(locator).toBeVisible({ timeout: 60_000 });
      return;
    } catch (error) {
      const hasTransientFetchError = await page
        .getByText("Failed to fetch")
        .first()
        .isVisible()
        .catch(() => false);

      if (!hasTransientFetchError || attempt === 2) throw error;

      await page.reload({ waitUntil: "domcontentloaded" });
    }
  }
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
    const accountResult = await client.query<AutomationAccountSettings>(
      `SELECT about,
              "allowHiddenAiDraftLinks",
              "draftReplyConfidence"::text,
              "includeReferralSignature",
              "multiRuleSelectionEnabled",
              "sensitiveDataPolicy",
              signature,
              "writingStyle"
       FROM "EmailAccount" WHERE id = $1`,
      [emailAccountId],
    );
    const previousAccountSettings = accountResult.rows[0];
    if (!previousAccountSettings) {
      throw new Error("The Playwright email account was not found");
    }

    const existingRule = await client.query<{ enabled: boolean; id: string }>(
      `SELECT id, enabled FROM "Rule"
       WHERE "emailAccountId" = $1 AND "systemType" = 'TO_REPLY'`,
      [emailAccountId],
    );
    const createdToReplyRule = existingRule.rowCount === 0;
    const previousToReplyRuleEnabled = existingRule.rows[0]?.enabled ?? null;
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

    const previousDraftActions = await client.query<DraftActionSnapshot>(
      `SELECT id, "createdAt", "updatedAt", type::text, "ruleId",
              "emailAccountId", "messagingChannelId",
              "messagingChannelEmailAccountId", label, "labelId", subject,
              content, "to", cc, bcc, url, "folderName", "folderId",
              "delayInMinutes", "staticAttachments", "integrationName",
              "integrationToolName", "integrationArgs"
       FROM "Action"
       WHERE "ruleId" = $1 AND type = 'DRAFT_EMAIL'
       ORDER BY id`,
      [toReplyRuleId],
    );
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

    return {
      createdToReplyRule,
      previousAccountSettings,
      previousDraftActions: previousDraftActions.rows,
      previousToReplyRuleEnabled,
      toReplyRuleId,
    };
  });
}

export async function cleanupAutomationSettings({
  createdToReplyRule,
  emailAccountId,
  previousAccountSettings,
  previousDraftActions,
  previousToReplyRuleEnabled,
  toReplyRuleId,
}: {
  createdToReplyRule: boolean;
  emailAccountId: string;
  previousAccountSettings: AutomationAccountSettings;
  previousDraftActions: DraftActionSnapshot[];
  previousToReplyRuleEnabled: boolean | null;
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
      for (const action of previousDraftActions) {
        await restoreDraftAction(client, action);
      }
      if (previousToReplyRuleEnabled !== null) {
        await client.query(
          `UPDATE "Rule" SET enabled = $2, "updatedAt" = CURRENT_TIMESTAMP
           WHERE id = $1 AND "emailAccountId" = $3`,
          [toReplyRuleId, previousToReplyRuleEnabled, emailAccountId],
        );
      }
    }
    await client.query(
      `UPDATE "EmailAccount"
       SET about = $2,
           "writingStyle" = $3,
           signature = $4,
           "includeReferralSignature" = $5,
           "multiRuleSelectionEnabled" = $6,
           "sensitiveDataPolicy" = $7,
           "draftReplyConfidence" = $8::"DraftReplyConfidence",
           "allowHiddenAiDraftLinks" = $9,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        emailAccountId,
        previousAccountSettings.about,
        previousAccountSettings.writingStyle,
        previousAccountSettings.signature,
        previousAccountSettings.includeReferralSignature,
        previousAccountSettings.multiRuleSelectionEnabled,
        previousAccountSettings.sensitiveDataPolicy,
        previousAccountSettings.draftReplyConfidence,
        previousAccountSettings.allowHiddenAiDraftLinks,
      ],
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
      writingStyle: string | null;
    }>(
      `SELECT about,
              "allowHiddenAiDraftLinks",
              "draftReplyConfidence"::text,
              "includeReferralSignature",
              "multiRuleSelectionEnabled",
              "sensitiveDataPolicy",
              "writingStyle"
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
       ORDER BY "updatedAt" DESC
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

async function restoreDraftAction(client: Client, action: DraftActionSnapshot) {
  await client.query(
    `INSERT INTO "Action" (
       id, "createdAt", "updatedAt", type, "ruleId", "emailAccountId",
       "messagingChannelId", "messagingChannelEmailAccountId", label,
       "labelId", subject, content, "to", cc, bcc, url, "folderName",
       "folderId", "delayInMinutes", "staticAttachments", "integrationName",
       "integrationToolName", "integrationArgs"
     )
     VALUES (
       $1, $2, $3, $4::"ActionType", $5, $6, $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21, $22, $23::jsonb
     )`,
    [
      action.id,
      action.createdAt,
      action.updatedAt,
      action.type,
      action.ruleId,
      action.emailAccountId,
      action.messagingChannelId,
      action.messagingChannelEmailAccountId,
      action.label,
      action.labelId,
      action.subject,
      action.content,
      action.to,
      action.cc,
      action.bcc,
      action.url,
      action.folderName,
      action.folderId,
      action.delayInMinutes,
      stringifyJson(action.staticAttachments),
      action.integrationName,
      action.integrationToolName,
      stringifyJson(action.integrationArgs),
    ],
  );
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

function stringifyJson(value: unknown) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}
