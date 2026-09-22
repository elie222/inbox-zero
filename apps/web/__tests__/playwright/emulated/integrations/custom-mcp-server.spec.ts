import { expect } from "@playwright/test";
import { Client } from "pg";
import {
  createKnowledgeBaseMcpEmulator,
  KNOWLEDGE_BASE_TOOL_NAMES,
  type KnowledgeBaseMcpEmulator,
} from "@/__tests__/emulators/knowledge-base-mcp";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  getIntegrationRow,
  getIntegrationToolCard,
  openIntegrations,
} from "./integration-test-helpers";

// run-emulated-suite.mjs starts the app with MCP_ALLOW_PRIVATE_IPS=true for
// this spec so the app may call the emulator's local http address.

const SERVER_NAME = "Team knowledge base";
const API_KEY = "playwright-kb-key";

let emulator: KnowledgeBaseMcpEmulator;
let tierFixture: PlusTierFixture | undefined;

test.beforeAll(async () => {
  emulator = await createKnowledgeBaseMcpEmulator({ apiKey: API_KEY });
});

// afterAll rather than afterEach so the automatic final-state capture, taken
// when the page fixture tears down, still shows the Plus integrations page.
test.afterAll(async () => {
  await emulator?.close();
  if (!tierFixture) return;
  await removeCustomServers(tierFixture.emailAccountId);
  await restoreTier(tierFixture);
  tierFixture = undefined;
});

test("adds, inspects, and removes a custom MCP server", async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000);
  const emailAccountId = await getEmailAccountId(page, { timeout: 120_000 });
  await removeCustomServers(emailAccountId);
  tierFixture = await grantPlusTier(emailAccountId);

  await openIntegrations(page);

  await page.getByRole("button", { name: "Add custom server" }).click();
  const dialog = page.getByRole("dialog", { name: "Add custom server" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name", { exact: true }).fill(SERVER_NAME);
  await dialog.getByLabel("Server URL").fill(emulator.url);
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "API key" }).click();
  await dialog.getByLabel("API key").fill(API_KEY);
  await capturePlaywrightCheckpoint(page, testInfo, "add-custom-server-dialog");

  await dialog.getByRole("button", { name: "Add server" }).click();
  await expect(page.getByText("Server added", { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await expect(dialog).toBeHidden();

  const row = getIntegrationRow(page, SERVER_NAME);
  await expect(row.getByText("Custom", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(row.getByText("Connected", { exact: false })).toBeVisible();
  await expect(row.getByText("127.0.0.1", { exact: true })).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  await capturePlaywrightCheckpoint(page, testInfo, "custom-server-connected");

  await row.getByRole("button", { name: "Integration actions" }).click();
  await page
    .getByRole("menuitem", { name: "Manage tools (2 of 3 on)" })
    .click();

  for (const toolName of [
    KNOWLEDGE_BASE_TOOL_NAMES.search,
    KNOWLEDGE_BASE_TOOL_NAMES.get,
  ]) {
    await expect(
      getIntegrationToolCard(page, toolName).getByRole("switch"),
    ).toBeChecked();
  }
  const updateToolCard = getIntegrationToolCard(
    page,
    KNOWLEDGE_BASE_TOOL_NAMES.update,
  );
  await expect(updateToolCard.getByRole("switch")).not.toBeChecked();
  await updateToolCard.scrollIntoViewIfNeeded();
  await capturePlaywrightCheckpoint(page, testInfo, "custom-server-tools");

  await row.getByRole("button", { name: "Integration actions" }).click();
  const removeItem = page.getByRole("menuitem", { name: "Remove" });
  await expect(removeItem).toBeVisible();
  await removeItem.hover();
  await capturePlaywrightCheckpoint(page, testInfo, "custom-server-remove");

  const confirmMessage = new Promise<string>((resolve) => {
    page.once("dialog", async (confirmDialog) => {
      resolve(confirmDialog.message());
      await confirmDialog.accept();
    });
  });
  await removeItem.click();
  expect(await confirmMessage).toContain(
    "Are you sure you want to remove this server?",
  );
  await expect(page.getByText("Server removed", { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await expect(row).toHaveCount(0);

  await openIntegrations(page);
  await expect(getIntegrationRow(page, "Notion")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(SERVER_NAME, { exact: true })).toHaveCount(0);
  await expect.poll(() => countCustomServers(emailAccountId)).toBe(0);
  // Syncing only lists tools; nothing should have invoked one
  expect(emulator.toolCalls).toEqual([]);
});

type PlusTierFixture = {
  emailAccountId: string;
  premiumId: string;
  previousPremiumId: string | null;
};

async function grantPlusTier(emailAccountId: string): Promise<PlusTierFixture> {
  const premiumId = `playwright_custom_mcp_premium_${process.env.PLAYWRIGHT_RUN_ID ?? "local"}`;

  return withClient(async (client) => {
    const result = await client.query<{ premiumId: string | null }>(
      `SELECT u."premiumId"
       FROM "EmailAccount" ea
       JOIN "User" u ON u.id = ea."userId"
       WHERE ea.id = $1`,
      [emailAccountId],
    );
    if (!result.rows[0]) throw new Error("Playwright email account not found");

    await client.query(
      `INSERT INTO "Premium" (
         id, "createdAt", "updatedAt", "pendingInvites", tier,
         "stripeSubscriptionStatus"
       )
       VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ARRAY[]::text[],
         'PLUS_MONTHLY', 'active')
       ON CONFLICT (id) DO UPDATE
       SET tier = EXCLUDED.tier,
           "stripeSubscriptionStatus" = EXCLUDED."stripeSubscriptionStatus",
           "updatedAt" = CURRENT_TIMESTAMP`,
      [premiumId],
    );
    await client.query(
      `UPDATE "User"
       SET "premiumId" = $2, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = (SELECT "userId" FROM "EmailAccount" WHERE id = $1)`,
      [emailAccountId, premiumId],
    );

    return {
      emailAccountId,
      premiumId,
      previousPremiumId: result.rows[0].premiumId,
    };
  });
}

async function restoreTier(fixture: PlusTierFixture) {
  await withClient(async (client) => {
    await client.query(
      `UPDATE "User"
       SET "premiumId" = $2, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "premiumId" = $3
         AND id = (SELECT "userId" FROM "EmailAccount" WHERE id = $1)`,
      [fixture.emailAccountId, fixture.previousPremiumId, fixture.premiumId],
    );
    await client.query(`DELETE FROM "Premium" WHERE id = $1`, [
      fixture.premiumId,
    ]);
  });
}

async function removeCustomServers(emailAccountId: string) {
  await withClient((client) =>
    client.query(`DELETE FROM "McpIntegration" WHERE "emailAccountId" = $1`, [
      emailAccountId,
    ]),
  );
}

async function countCustomServers(emailAccountId: string) {
  return withClient(async (client) => {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM "McpIntegration" WHERE "emailAccountId" = $1`,
      [emailAccountId],
    );
    return Number(result.rows[0]?.count ?? 0);
  });
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
