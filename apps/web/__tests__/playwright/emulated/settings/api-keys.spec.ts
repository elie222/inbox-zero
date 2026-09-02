import { expect } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { openSettings } from "./settings-test-helpers";

const API_KEY_NAME = `Playwright API key ${process.env.PLAYWRIGHT_RUN_ID ?? process.pid}`;

let emailAccountIdForCleanup: string | undefined;

test.afterEach(async () => {
  await cleanupApiKeys(emailAccountIdForCleanup);
  emailAccountIdForCleanup = undefined;
});

test("creates, authorizes, lists, and revokes an API key", async ({
  page,
  request,
}) => {
  test.setTimeout(360_000);
  const emailAccountId = await getEmailAccountId(page);
  emailAccountIdForCleanup = emailAccountId;
  await cleanupApiKeys(emailAccountId);
  await openSettings(page);

  await expect(
    page.getByRole("heading", { name: "Developer", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Create key" }).click();

  const createDialog = page.getByRole("dialog", {
    name: "Create new secret key",
  });
  await createDialog.getByLabel("Name (optional)").fill(API_KEY_NAME);
  await expect(createDialog.getByRole("checkbox")).toHaveCount(3);
  for (const checkbox of await createDialog.getByRole("checkbox").all()) {
    await expect(checkbox).toBeChecked();
  }
  await createDialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("API key created!", { exact: true })).toBeVisible(
    { timeout: 60_000 },
  );

  const secretKey = await createDialog
    .locator('input[name="copy-input"]')
    .inputValue();
  expect(secretKey.length).toBeGreaterThan(32);

  const authorizedResponse = await request.get("/api/v1/rules", {
    headers: { "API-Key": secretKey },
  });
  expect(authorizedResponse.status()).toBe(200);

  const invalidResponse = await request.get("/api/v1/rules", {
    headers: { "API-Key": "iz_invalid" },
  });
  expect(invalidResponse.status()).toBe(401);

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "View keys (1)" }).click();
  const keysDialog = page.getByRole("dialog", { name: "API Keys" });
  const keyRow = keysDialog.getByRole("row").filter({ hasText: API_KEY_NAME });
  await expect(keyRow).toContainText("Read rules");
  await keyRow.getByRole("button", { name: "Revoke" }).click();
  await expect(
    page.getByText("API key deactivated!", { exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(keyRow).toBeHidden({ timeout: 60_000 });

  const revokedResponse = await request.get("/api/v1/rules", {
    headers: { "API-Key": secretKey },
  });
  expect(revokedResponse.status()).toBe(401);
});

async function cleanupApiKeys(emailAccountId?: string) {
  if (!emailAccountId) return;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `DELETE FROM "ApiKey"
       WHERE "emailAccountId" = $1 AND name = $2`,
      [emailAccountId, API_KEY_NAME],
    );
  } finally {
    await client.end();
  }
}
