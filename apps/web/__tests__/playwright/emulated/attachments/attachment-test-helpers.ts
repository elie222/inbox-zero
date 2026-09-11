import { expect, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";
import { getEmailAccountId } from "../account-test-helpers";

const PLAYWRIGHT_TEST_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-test@gmail.com";

export async function openAttachments(page: Page) {
  const emailAccountId = await getEmailAccountId(page, { timeout: 120_000 });

  await navigateUntilReady(
    page,
    `/${emailAccountId}/drive`,
    page.getByRole("heading", { name: "Let's set up auto-filing" }),
  );
}

export async function setupAttachmentTestState() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await resetAttachmentState(client);
    const result = await client.query(
      `INSERT INTO "DriveConnection" (
         id, "createdAt", "updatedAt", provider, email,
         "accessToken", "refreshToken", "expiresAt", "isConnected",
         "emailAccountId"
       )
       SELECT
         ea.id || '-playwright-drive',
         CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP,
         'google',
         ea.email,
         account.access_token,
         account.refresh_token,
         account.expires_at,
         true,
         ea.id
       FROM "EmailAccount" ea
       INNER JOIN "Account" account ON account.id = ea."accountId"
       WHERE ea.email = $1
       RETURNING id`,
      [PLAYWRIGHT_TEST_EMAIL],
    );
    if (result.rowCount !== 1) {
      throw new Error("Could not seed the Playwright Drive connection");
    }
  } finally {
    await client.end();
  }
}

export async function resetAttachmentTestState() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await resetAttachmentState(client);
  } finally {
    await client.end();
  }
}

async function resetAttachmentState(client: Client) {
  await client.query(
    `DELETE FROM "DriveConnection"
     WHERE "emailAccountId" = (
       SELECT id FROM "EmailAccount" WHERE email = $1
     )`,
    [PLAYWRIGHT_TEST_EMAIL],
  );
  await client.query(
    `UPDATE "EmailAccount"
     SET "filingEnabled" = false, "filingPrompt" = NULL
     WHERE email = $1`,
    [PLAYWRIGHT_TEST_EMAIL],
  );
}

async function navigateUntilReady(page: Page, url: string, ready: Locator) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(url, { timeout: 60_000, waitUntil: "domcontentloaded" });
      await expect(ready).toBeVisible({ timeout: 60_000 });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
}
