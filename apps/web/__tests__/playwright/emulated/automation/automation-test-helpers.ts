import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

export const RULE_NAME = "Playwright receipts";
export const UPDATED_RULE_NAME = "Playwright vendor receipts";

export async function getEmailAccountId(page: Page) {
  const response = await page.request.get("/api/user/email-accounts");
  expect(response.ok()).toBeTruthy();
  const { emailAccounts } = (await response.json()) as {
    emailAccounts: { id: string }[];
  };
  const emailAccountId = emailAccounts[0]?.id;
  if (!emailAccountId) throw new Error("The setup project created no account");
  return emailAccountId;
}

export async function markAssistantOnboardingViewed(page: Page) {
  await page.goto("/");
  await page.context().addCookies([
    {
      name: "viewed_assistant_onboarding",
      value: "true",
      url: new URL(page.url()).origin,
    },
  ]);
}

export async function cleanupTestRules(emailAccountId?: string) {
  if (!emailAccountId) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `DELETE FROM "Rule"
       WHERE "emailAccountId" = $1 AND name IN ($2, $3)`,
      [emailAccountId, RULE_NAME, UPDATED_RULE_NAME],
    );
  } finally {
    await client.end();
  }
}

export async function getRuleState(emailAccountId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{
      enabled: boolean;
      instructions: string | null;
      name: string;
      type: string;
    }>(
      `SELECT r.name, r.enabled, r.instructions, a.type::text
       FROM "Rule" r
       JOIN "Action" a ON a."ruleId" = r.id
       WHERE r."emailAccountId" = $1 AND r.name IN ($2, $3)`,
      [emailAccountId, RULE_NAME, UPDATED_RULE_NAME],
    );
    return result.rows[0];
  } finally {
    await client.end();
  }
}
