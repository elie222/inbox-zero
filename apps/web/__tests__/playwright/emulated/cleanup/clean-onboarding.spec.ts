import { expect } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "../mail/account-test-helpers";

test("clean onboarding sends a disconnected account to reconnect", async ({
  page,
}, testInfo) => {
  const primaryEmailAccountId = await getEmailAccountId(page);
  const account = await createSecondEmailAccount(primaryEmailAccountId);
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  let cleanupError: unknown;

  try {
    await client.connect();
    // An already-disconnected disposable account avoids notifications and other
    // credential-cleanup side effects on the shared seeded account and user.
    await client.query(
      `UPDATE "Account"
       SET refresh_token = NULL, access_token = NULL, expires_at = NULL,
           "disconnectedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [account.accountId],
    );
    await page.goto(`/${account.id}/clean/onboarding`);
    await expect(page).toHaveURL(
      new RegExp(`/${account.id}/permissions/consent$`),
    );
    await expect(
      page.getByRole("button", { name: "Reconnect account", exact: true }),
    ).toBeVisible();
  } finally {
    for (const cleanup of [
      () => client.end(),
      () => deleteSecondEmailAccount(account.accountId),
    ]) {
      try {
        await cleanup();
      } catch (error) {
        cleanupError ??= error;
        testInfo.annotations.push({
          type: "cleanup-error",
          description: String(error),
        });
      }
    }
  }
  if (cleanupError !== undefined) throw cleanupError;
});
