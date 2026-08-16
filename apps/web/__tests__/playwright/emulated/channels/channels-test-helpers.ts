import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

export const CHANNEL_ID = "playwright-telegram-channel";
export const CHANNEL_RULE_ID = "playwright-channel-rule";
export const CHANNEL_RULE_NAME = "Playwright priority notifications";

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

export async function seedChannel(emailAccountId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await deleteSeededState(client);
    await client.query(
      `INSERT INTO "Rule"
         (id, name, enabled, automate, "runOnThreads", "conditionalOperator",
          instructions, "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, $2, true, true, false, 'AND', $3, $4,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        CHANNEL_RULE_ID,
        CHANNEL_RULE_NAME,
        "Messages that need immediate attention",
        emailAccountId,
      ],
    );
    await client.query(
      `INSERT INTO "Action"
         (id, type, "ruleId", "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, 'ARCHIVE', $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [`${CHANNEL_RULE_ID}-archive`, CHANNEL_RULE_ID, emailAccountId],
    );
    await client.query(
      `INSERT INTO "MessagingChannel"
         (id, provider, "isConnected", "teamId", "teamName", "providerUserId",
          "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, 'TELEGRAM', true, $2, 'Playwright Telegram', $2, $3,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [CHANNEL_ID, "playwright-chat-1001", emailAccountId],
    );
    await client.query(
      `INSERT INTO "MessagingRoute"
         (id, purpose, "targetType", "targetId", "messagingChannelId",
          "createdAt", "updatedAt")
       VALUES ($1, 'RULE_NOTIFICATIONS', 'DIRECT_MESSAGE', $2, $3,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [`${CHANNEL_ID}-notifications`, "playwright-chat-1001", CHANNEL_ID],
    );
  } finally {
    await client.end();
  }
}

export async function cleanupSeededChannel() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await deleteSeededState(client);
  } finally {
    await client.end();
  }
}

export async function getChannelState() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const channelResult = await client.query<{ isConnected: boolean }>(
      `SELECT "isConnected" FROM "MessagingChannel" WHERE id = $1`,
      [CHANNEL_ID],
    );
    const actionsResult = await client.query<{ type: string }>(
      `SELECT type::text FROM "Action"
       WHERE "ruleId" = $1 AND "messagingChannelId" = $2`,
      [CHANNEL_RULE_ID, CHANNEL_ID],
    );
    const routesResult = await client.query<{ purpose: string }>(
      `SELECT purpose::text FROM "MessagingRoute"
       WHERE "messagingChannelId" = $1 ORDER BY purpose::text`,
      [CHANNEL_ID],
    );
    return {
      actionTypes: actionsResult.rows.map((row) => row.type),
      isConnected: channelResult.rows[0]?.isConnected,
      routePurposes: routesResult.rows.map((row) => row.purpose),
    };
  } finally {
    await client.end();
  }
}

async function deleteSeededState(client: Client) {
  await client.query(`DELETE FROM "MessagingChannel" WHERE id = $1`, [
    CHANNEL_ID,
  ]);
  await client.query(`DELETE FROM "Rule" WHERE id = $1`, [CHANNEL_RULE_ID]);
}
