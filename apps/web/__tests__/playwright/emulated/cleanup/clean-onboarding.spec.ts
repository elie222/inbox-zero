import { expect } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";

test("clean onboarding sends a disconnected account to reconnect", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();

  try {
    const result = await client.query<{
      id: string;
      refresh_token: string | null;
    }>(
      `SELECT a.id, a.refresh_token
       FROM "Account" a
       JOIN "EmailAccount" ea ON ea."accountId" = a.id
       WHERE ea.id = $1`,
      [emailAccountId],
    );
    const account = result.rows[0];
    if (!account) throw new Error("The emulated account was not found");

    await client.query(
      'UPDATE "Account" SET refresh_token = NULL WHERE id = $1',
      [account.id],
    );
    try {
      await page.goto(`/${emailAccountId}/clean/onboarding`);
      await expect(page).toHaveURL(
        new RegExp(`/${emailAccountId}/permissions/consent$`),
      );
      await expect(
        page.getByRole("button", { name: "Reconnect account", exact: true }),
      ).toBeVisible();
    } finally {
      await client.query(
        'UPDATE "Account" SET refresh_token = $2 WHERE id = $1',
        [account.id, account.refresh_token],
      );
    }
  } finally {
    await client.end();
  }
});
