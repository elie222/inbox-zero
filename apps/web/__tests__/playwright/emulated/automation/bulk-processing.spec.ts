import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { markAutomationOnboardingViewed } from "./automation-tabs-test-helpers";

for (const tier of ["PLUS_MONTHLY", "PROFESSIONAL_MONTHLY"] as const) {
  test(`explains historical read-email access for ${tier}`, async ({
    page,
  }) => {
    const emailAccountId = await getEmailAccountId(page);
    await markAutomationOnboardingViewed(page);
    await page.route("**/api/user/me", async (route) => {
      const response = await route.fetch();
      const user = await response.json();
      await route.fulfill({
        response,
        json: {
          ...user,
          premium: {
            ...user.premium,
            tier,
            stripeSubscriptionStatus: "active",
          },
        },
      });
    });

    await page.goto(`/${emailAccountId}/automation`);
    const dialog = page.getByRole("dialog", { name: "Bulk Process Emails" });
    await expect(async () => {
      if (!(await dialog.isVisible())) {
        await page.getByRole("button", { name: "Process Past Emails" }).click();
      }
      await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await expect(
      dialog.getByText("Run your rules on emails already in your inbox."),
    ).toBeVisible();
    const generateDraftReplies = dialog.getByRole("switch", {
      name: "Generate draft replies",
    });
    await expect(generateDraftReplies).not.toBeChecked();
    await generateDraftReplies.click();
    await expect(generateDraftReplies).toBeChecked();
    await generateDraftReplies.click();
    await expect(generateDraftReplies).not.toBeChecked();

    const includeRead = dialog.getByRole("switch", {
      name: "Include read emails",
    });

    if (tier === "PLUS_MONTHLY") {
      await expect(includeRead).toHaveCount(0);
      await expect(
        dialog.getByRole("button", {
          name: "Upgrade to use include read emails",
        }),
      ).toBeVisible();
    } else {
      await expect(includeRead).toBeEnabled();
      await includeRead.click();
      await expect(includeRead).toBeChecked();
    }
  });
}

test("keeps a background run visible across navigation and reload", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const premiumId = randomUUID();
  const {
    rows: [owner],
  } = await client.query(
    'SELECT u.id, u."premiumId" FROM "User" u JOIN "EmailAccount" ea ON ea."userId" = u.id WHERE ea.id = $1',
    [emailAccountId],
  );
  await client.query(
    `INSERT INTO "Premium" (id, "createdAt", "updatedAt", "pendingInvites", tier, "stripeSubscriptionStatus") VALUES ($1, NOW(), NOW(), ARRAY[]::text[], 'BUSINESS_PLUS_MONTHLY', 'active')`,
    [premiumId],
  );
  await client.query('UPDATE "User" SET "premiumId" = $1 WHERE id = $2', [
    premiumId,
    owner.id,
  ]);
  try {
    await markAutomationOnboardingViewed(page);
    await page.goto(`/${emailAccountId}/automation`);
    await page.getByRole("button", { name: "Process Past Emails" }).click();
    const dialog = page.getByRole("dialog", { name: "Bulk Process Emails" });
    await dialog
      .getByRole("button", { name: "Set start date", exact: true })
      .click();
    await page
      .locator('button[name="day"]:not(.day-outside):not([disabled])')
      .first()
      .click();
    await page.keyboard.press("Escape");
    await dialog
      .getByRole("button", { name: "Process Emails", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    const response = await page.request.get("/api/user/bulk-runs");
    const { runs } = await response.json();
    const runId = runs.find(
      (run: { emailAccountId: string }) =>
        run.emailAccountId === emailAccountId,
    ).id;
    await client.query(
      `INSERT INTO "BulkRuleRunItem" (id, "updatedAt", "runId", "threadId", "messageId", subject, status, "ruleNames") VALUES ($1, NOW(), $2, 'receipt-thread', 'receipt-message', 'Order receipt', 'COMPLETED', ARRAY['Purchases']), ($3, NOW(), $2, 'meeting-thread', 'meeting-message', 'Meeting follow-up', 'PENDING', ARRAY[]::text[])`,
      [randomUUID(), runId, randomUUID()],
    );
    await client.query(
      `UPDATE "BulkRuleRun" SET status = 'RUNNING', "scannedAt" = NOW() WHERE id = $1`,
      [runId],
    );
    await expect(
      dialog.getByText("Order receipt", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText("Purchases", { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("background-run-dialog.png"),
    });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.goto(`/${emailAccountId}/settings`);
    await expect(
      page.getByRole("button", { name: "View progress", exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "View progress", exact: true })
      .click();
    await expect(dialog.getByText(/1 of 2 processed/)).toBeVisible();
    await dialog.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Resume", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("background-run-paused.png"),
    });
    await dialog.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(dialog.getByText(/Stopped/)).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Dismiss completed email processing" })
      .click();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "View progress", exact: true }),
    ).toBeHidden();
    await page.route("**/api/user/bulk-runs", (route) =>
      route.fulfill({
        json: {
          runs: [
            {
              ...runs[0],
              id: "empty-completed-run",
              status: "COMPLETED",
              total: 0,
              completed: 0,
              failed: 0,
              items: [],
            },
          ],
        },
      }),
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: "View progress", exact: true }),
    ).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath("empty-completed-runs-hidden.png"),
    });
  } finally {
    await client.query(
      'DELETE FROM "BulkRuleRun" WHERE "emailAccountId" = $1',
      [emailAccountId],
    );
    await client.query('UPDATE "User" SET "premiumId" = $1 WHERE id = $2', [
      owner.premiumId,
      owner.id,
    ]);
    await client.query('DELETE FROM "Premium" WHERE id = $1', [premiumId]);
    await client.end();
  }
});
