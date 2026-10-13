import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Client } from "pg";
import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";

test("local password sign-in keeps the owner's connected accounts", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    process.env.LOCAL_PASSWORD_AUTH_ENABLED !== "true",
    "Local password login is opt-in",
  );
  const session = await (
    await page.request.get("/api/auth/get-session")
  ).json();
  const before = await (
    await page.request.get("/api/user/email-accounts")
  ).json();
  const credentialId = randomUUID();
  const password = `local-test-${randomUUID()}`;
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const context = await browser.newContext({
    baseURL: process.env.NEXT_PUBLIC_BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    await db.query(
      'INSERT INTO "Account" (id, "updatedAt", "userId", provider, "providerAccountId", password) VALUES ($1, NOW(), $2, \'credential\', $2, $3)',
      [credentialId, session.user.id, await hashPassword(password)],
    );
    const login = await context.newPage();
    await login.goto(
      `/login?next=${encodeURIComponent(`/${before.emailAccounts[0].id}/mail`)}`,
    );
    await capturePlaywrightCheckpoint(login, testInfo, "local-password-login");
    await login.getByLabel("Email", { exact: true }).fill(session.user.email);
    await login.getByLabel("Password", { exact: true }).fill(password);
    await login
      .getByRole("button", { name: "Sign in locally", exact: true })
      .click();
    await expect(login).toHaveURL(
      new RegExp(`/${before.emailAccounts[0].id}/mail`),
    );
    const after = await (
      await context.request.get("/api/user/email-accounts")
    ).json();
    expect(
      after.emailAccounts.map((account: { id: string }) => account.id).sort(),
    ).toEqual(
      before.emailAccounts.map((account: { id: string }) => account.id).sort(),
    );
    await login.goto("/settings");
    const localAccount = login.getByRole("region", { name: "Local account" });
    await expect(localAccount).toBeVisible();
    const newPassword = `changed-local-${randomUUID()}`;
    await localAccount
      .getByLabel("Current password", { exact: true })
      .fill(password);
    await localAccount
      .getByLabel("New password", { exact: true })
      .fill(newPassword);
    await localAccount
      .getByLabel("Confirm new password", { exact: true })
      .fill("mismatch");
    await localAccount.getByRole("button", { name: "Change password" }).click();
    await expect(
      localAccount.getByText("Passwords do not match", { exact: true }),
    ).toBeVisible();
    await localAccount
      .getByLabel("Confirm new password", { exact: true })
      .fill(newPassword);
    await localAccount.getByRole("button", { name: "Change password" }).click();
    await expect(
      localAccount.getByText("Your local password has been updated.", {
        exact: true,
      }),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(
      login,
      testInfo,
      "local-account-settings",
    );
    const signedOut = await browser.newContext({
      baseURL: process.env.NEXT_PUBLIC_BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const rejected = await signedOut.request.post("/api/auth/sign-in/email", {
        data: { email: session.user.email, password },
      });
      expect(rejected.status()).toBe(401);
      const accepted = await signedOut.request.post("/api/auth/sign-in/email", {
        data: { email: session.user.email, password: newPassword },
      });
      expect(accepted.ok()).toBe(true);
    } finally {
      await signedOut.close();
    }
    const signup = await context.request.post("/api/auth/sign-up/email", {
      data: {
        email: `uninvited-${randomUUID()}@example.com`,
        password,
        name: "Uninvited",
      },
    });
    expect(signup.ok()).toBe(false);
    await capturePlaywrightCheckpoint(
      login,
      testInfo,
      "local-password-signed-in",
    );
  } finally {
    await context.close();
    await db.query('DELETE FROM "Account" WHERE id = $1', [credentialId]);
    await db.end();
  }
});
