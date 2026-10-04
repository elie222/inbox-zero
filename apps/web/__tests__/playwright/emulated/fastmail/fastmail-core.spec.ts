import { spawn } from "node:child_process";
import { expect } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";

test("connects Fastmail and searches ordinary text through JMAP", async ({
  page,
}, testInfo) => {
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add Fastmail" }).click();
  const dialog = page.getByRole("dialog");
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "fastmail-token-connection",
  );
  await dialog.getByLabel("API Token").fill("fixture-fastmail-token");
  await dialog.getByRole("button", { name: "Connect Account" }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  const response = await page.request.get("/api/user/email-accounts");
  const { emailAccounts } = await response.json();
  const account = emailAccounts.find((entry: { email: string }) =>
    entry.email.startsWith("fastmail-fixture+"),
  );
  expect(account).toBeTruthy();
  await expect(
    page.getByText(account.email, { exact: true }).first(),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "fastmail-connected-account",
  );
  await page.goto(`/${account.id}/mail`);
  const conversations = page.getByRole("listbox", { name: "Conversations" });
  await expect(
    conversations.getByRole("option").filter({ hasText: "Safety receipt" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    conversations.getByRole("option").filter({ hasText: "Team update" }),
  ).toBeVisible();
  const search = page.getByPlaceholder("Search mail");
  await search.fill("Safety");
  await search.press("Enter");
  await expect(
    conversations.getByRole("option").filter({ hasText: "Safety receipt" }),
  ).toBeVisible();
  await expect(
    conversations.getByRole("option").filter({ hasText: "Team update" }),
  ).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "fastmail-search-results");
  await page.goto(`/${account.id}/calendars`);
  await page.getByRole("button", { name: "Add Fastmail Calendar" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your mail API token cannot access calendars",
  );
  await expect(page.getByLabel("Calendar app password")).toHaveAttribute(
    "type",
    "password",
  );
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "fastmail-calendar-connection",
  );

  const database = new Client({ connectionString: process.env.DATABASE_URL });
  await database.connect();
  const ruleId = `fastmail-filter-fixture-${account.id}`;
  const worker = spawn(process.execPath, ["../worker/src/index.mjs"], {
    env: {
      ...process.env,
      INTERNAL_API_URL: String(testInfo.project.use.baseURL),
      WORKER_QUEUES: "fastmail-sync",
    },
    stdio: "inherit",
  });
  const deadline = setTimeout(() => worker.kill("SIGKILL"), 120_000);
  try {
    await database.query(
      'INSERT INTO "Rule" (id, name, "emailAccountId", "from", "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
      [ruleId, "Fixture archive sender", account.id, "sender@example.com"],
    );
    await database.query(
      'INSERT INTO "Action" (id, type, "ruleId", "emailAccountId", "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
      [`fixture-action-${account.id}`, "ARCHIVE", ruleId, account.id],
    );
    for (const [index, trigger] of ["webhook", "poll"].entries()) {
      const messageId = `fixture-message-${index}`;
      await database.query(
        'INSERT INTO "FastmailSyncItem" ("emailAccountId", "messageId") VALUES ($1, $2)',
        [account.id, messageId],
      );
      const notification =
        trigger === "webhook"
          ? await page.request.post("/api/fastmail/webhook", {
              headers: {
                authorization: `Bearer ${process.env.FASTMAIL_WEBHOOK_SECRET}`,
              },
              data: { emailAccountId: account.id },
            })
          : await page.request.get("/api/fastmail/poll", {
              headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
            });
      expect(notification.status()).toBe(trigger === "webhook" ? 202 : 200);
      await expect
        .poll(
          async () => {
            const result = await database.query(
              'SELECT "processedAt" IS NOT NULL AS processed FROM "FastmailSyncItem" WHERE "emailAccountId" = $1 AND "messageId" = $2',
              [account.id, messageId],
            );
            return result.rows[0]?.processed;
          },
          { timeout: 60_000 },
        )
        .toBe(true);
      const messages = await (
        await page.request.get(
          `${process.env.PLAYWRIGHT_FASTMAIL_BASE_URL}/__fixture/messages`,
        )
      ).json();
      const message = messages.find(
        (entry: { id: string }) => entry.id === messageId,
      );
      expect(message.mailboxIds).toEqual({ archive: true });
    }
  } finally {
    clearTimeout(deadline);
    worker.kill("SIGTERM");
    const kill = setTimeout(() => worker.kill("SIGKILL"), 5000);
    kill.unref();
    await database.query(
      'DELETE FROM "Rule" WHERE id = $1 AND "emailAccountId" = $2',
      [ruleId, account.id],
    );
    await database.end();
  }
});
