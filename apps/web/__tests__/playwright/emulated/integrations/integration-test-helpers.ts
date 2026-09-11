import { expect, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";
import { getEmailAccountId } from "../account-test-helpers";

const PLAYWRIGHT_TEST_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-test@gmail.com";
const INTEGRATION_ID = "playwright-mcp-notion";

export async function openIntegrations(page: Page) {
  const emailAccountId = await getEmailAccountId(page, { timeout: 120_000 });

  await navigateUntilReady(
    page,
    `/${emailAccountId}/integrations`,
    page.getByRole("heading", { name: "Integrations", exact: true }),
  );
}

export async function setupIntegrationTestState() {
  await withClient(async (client) => {
    await resetIntegrationState(client);
    const result = await client.query(
      `WITH target AS (
         SELECT id AS "emailAccountId"
         FROM "EmailAccount"
         WHERE email = $1
       ), integration AS (
         INSERT INTO "McpIntegration" (id, name, "createdAt", "updatedAt")
         VALUES ($2, 'notion', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id
       ), connection AS (
         INSERT INTO "McpConnection" (
           id, name, "isActive", "integrationId", "emailAccountId",
           "createdAt", "updatedAt"
         )
         SELECT
           target."emailAccountId" || '-playwright-notion',
           'Playwright Notion Workspace',
           true,
           integration.id,
           target."emailAccountId",
           CURRENT_TIMESTAMP,
           CURRENT_TIMESTAMP
         FROM target, integration
         RETURNING id
       )
       INSERT INTO "McpTool" (
         id, name, description, "isEnabled", "isWrite", "connectionId",
         "createdAt", "updatedAt"
       )
       SELECT
         connection.id || '-fetch',
         'notion-fetch',
         'Fetch a Notion page',
         true,
         false,
         connection.id,
         CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP
       FROM connection
       UNION ALL
       SELECT
         connection.id || '-search',
         'notion-search',
         'Search the connected Notion workspace',
         false,
         false,
         connection.id,
         CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP
       FROM connection
       RETURNING id`,
      [PLAYWRIGHT_TEST_EMAIL, INTEGRATION_ID],
    );
    if (result.rowCount !== 2) {
      throw new Error("Could not seed the Playwright MCP integration");
    }
  });
}

export async function resetIntegrationTestState() {
  await withClient(resetIntegrationState);
}

export function getIntegrationRow(page: Page, name: string) {
  return page
    .getByRole("row")
    .filter({ has: page.getByText(name, { exact: true }) });
}

export function getIntegrationToolCard(page: Page, name: string) {
  return page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-lg')][1]");
}

async function resetIntegrationState(client: Client) {
  await client.query(
    `DELETE FROM "McpConnection"
     WHERE "emailAccountId" = (
       SELECT id FROM "EmailAccount" WHERE email = $1
     )
     AND "integrationId" = (
       SELECT id FROM "McpIntegration" WHERE name = 'notion'
     )`,
    [PLAYWRIGHT_TEST_EMAIL],
  );
  await client.query(
    `DELETE FROM "McpIntegration"
     WHERE id = $1
     AND NOT EXISTS (
       SELECT 1 FROM "McpConnection" WHERE "integrationId" = $1
     )`,
    [INTEGRATION_ID],
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
