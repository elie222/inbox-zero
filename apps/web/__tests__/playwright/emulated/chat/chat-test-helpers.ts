import type { Page } from "@playwright/test";
import { Client } from "pg";

export const SEEDED_CHAT_ID = "playwright-manage-chat";

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

export async function seedChat(emailAccountId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await deleteSeededChat(client);
    await client.query(
      `INSERT INTO "Chat" (id, "emailAccountId", name, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [SEEDED_CHAT_ID, emailAccountId, "Inbox planning"],
    );
    await client.query(
      `INSERT INTO "ChatMessage" (id, "chatId", role, parts, "createdAt", "updatedAt")
       VALUES ($1, $2, 'user', $3::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
              ($4, $2, 'assistant', $5::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        `${SEEDED_CHAT_ID}-user`,
        SEEDED_CHAT_ID,
        JSON.stringify([
          { type: "text", text: "Help me make a plan for today's inbox." },
        ]),
        `${SEEDED_CHAT_ID}-assistant`,
        JSON.stringify([
          {
            type: "text",
            text: "Start with unread mail, then review anything awaiting a reply.",
          },
        ]),
      ],
    );
  } finally {
    await client.end();
  }
}

export async function cleanupSeededChat() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await deleteSeededChat(client);
  } finally {
    await client.end();
  }
}

export async function getChatState(emailAccountId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{
      isDeleted: boolean;
      name: string | null;
    }>(
      `SELECT name, "deletedAt" IS NOT NULL AS "isDeleted"
       FROM "Chat"
       WHERE id = $1 AND "emailAccountId" = $2`,
      [SEEDED_CHAT_ID, emailAccountId],
    );
    return result.rows[0];
  } finally {
    await client.end();
  }
}

async function deleteSeededChat(client: Client) {
  await client.query(`DELETE FROM "Chat" WHERE id = $1`, [SEEDED_CHAT_ID]);
}
