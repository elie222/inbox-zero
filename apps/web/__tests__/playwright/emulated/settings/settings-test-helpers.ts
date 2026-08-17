import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

const SETTINGS_RULE_NAME = "Playwright settings rule";

export type SettingsFixture = {
  emailAccountId: string;
  email: string;
  ruleId: string;
  previousDraftCleanupDays: number | null;
  previousFollowUpAwaitingReplyDays: number | null;
  previousFollowUpNeedsReplyDays: number | null;
  previousRuleStates: { id: string; enabled: boolean }[];
};

export async function prepareSettingsFixture(
  page: Page,
): Promise<SettingsFixture> {
  const { id: emailAccountId, email } = await getEmailAccount(page);
  const ruleId = `playwright_settings_rule_${emailAccountId}`;

  return withClient(async (client) => {
    const accountResult = await client.query<{
      draftCleanupDays: number | null;
      followUpAwaitingReplyDays: number | null;
      followUpNeedsReplyDays: number | null;
    }>(
      `SELECT
         "draftCleanupDays",
         "followUpAwaitingReplyDays",
         "followUpNeedsReplyDays"
       FROM "EmailAccount"
       WHERE id = $1`,
      [emailAccountId],
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error("The Playwright email account was not found");

    const ruleResult = await client.query<{ id: string; enabled: boolean }>(
      `SELECT id, enabled
       FROM "Rule"
       WHERE "emailAccountId" = $1 AND id <> $2`,
      [emailAccountId, ruleId],
    );

    await client.query(`DELETE FROM "Rule" WHERE id = $1`, [ruleId]);
    await client.query(
      `UPDATE "EmailAccount"
       SET
         "draftCleanupDays" = 7,
         "followUpAwaitingReplyDays" = 3,
         "followUpNeedsReplyDays" = 5,
         "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [emailAccountId],
    );
    await client.query(
      `INSERT INTO "Rule" (
         id, "createdAt", "updatedAt", name, enabled, automate,
         "runOnThreads", instructions, "emailAccountId"
       )
       VALUES (
         $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, true, true,
         false, 'Archive routine settings test messages', $3
       )`,
      [ruleId, SETTINGS_RULE_NAME, emailAccountId],
    );

    return {
      emailAccountId,
      email,
      ruleId,
      previousDraftCleanupDays: account.draftCleanupDays,
      previousFollowUpAwaitingReplyDays: account.followUpAwaitingReplyDays,
      previousFollowUpNeedsReplyDays: account.followUpNeedsReplyDays,
      previousRuleStates: ruleResult.rows,
    };
  });
}

export async function cleanUpSettingsFixture(fixture: SettingsFixture) {
  await withClient(async (client) => {
    await client.query(`DELETE FROM "Rule" WHERE id = $1`, [fixture.ruleId]);
    for (const rule of fixture.previousRuleStates) {
      await client.query(
        `UPDATE "Rule"
         SET enabled = $2, "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $1 AND "emailAccountId" = $3`,
        [rule.id, rule.enabled, fixture.emailAccountId],
      );
    }
    await client.query(
      `UPDATE "EmailAccount"
       SET
         "draftCleanupDays" = $2,
         "followUpAwaitingReplyDays" = $3,
         "followUpNeedsReplyDays" = $4,
         "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        fixture.emailAccountId,
        fixture.previousDraftCleanupDays,
        fixture.previousFollowUpAwaitingReplyDays,
        fixture.previousFollowUpNeedsReplyDays,
      ],
    );
  });
}

export async function getSettingsDatabaseState(fixture: SettingsFixture) {
  return withClient(async (client) => {
    const result = await client.query<{
      draftCleanupDays: number | null;
      followUpAwaitingReplyDays: number | null;
      followUpNeedsReplyDays: number | null;
      ruleEnabled: boolean;
    }>(
      `SELECT
         ea."draftCleanupDays",
         ea."followUpAwaitingReplyDays",
         ea."followUpNeedsReplyDays",
         r.enabled AS "ruleEnabled"
       FROM "EmailAccount" ea
       JOIN "Rule" r ON r.id = $2 AND r."emailAccountId" = ea.id
       WHERE ea.id = $1`,
      [fixture.emailAccountId, fixture.ruleId],
    );
    const state = result.rows[0];
    if (!state) throw new Error("The Playwright settings state was not found");
    return state;
  });
}

export async function openSettings(page: Page) {
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
}

export function getEmailAccountSettingsCard(page: Page, email: string) {
  const emailAccountsSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Email Accounts", exact: true }),
  });
  const toggle = emailAccountsSection
    .getByRole("button")
    .filter({ hasText: email });
  return {
    card: toggle.locator("xpath=.."),
    toggle,
  };
}

async function getEmailAccount(page: Page) {
  const response = await page.request.get("/api/user/email-accounts");
  expect(response.ok()).toBeTruthy();
  const { emailAccounts } = (await response.json()) as {
    emailAccounts: { id: string; email: string }[];
  };
  const emailAccount = emailAccounts[0];
  if (!emailAccount) throw new Error("The setup project created no account");
  return emailAccount;
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
