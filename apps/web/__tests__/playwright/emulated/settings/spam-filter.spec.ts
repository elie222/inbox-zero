import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  markAutomationOnboardingViewed,
  getAutomationSettingsCard,
} from "../automation/automation-tabs-test-helpers";

test("enables an imported spam model and persists the setting", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const id = `playwright_spam_${randomUUID()}`;
  const account = await client.query<{
    userId: string;
    spamFilterEnabled: boolean;
  }>(`SELECT "userId","spamFilterEnabled" FROM "EmailAccount" WHERE id=$1`, [
    emailAccountId,
  ]);
  let inserted = false;
  try {
    await client.query(
      `INSERT INTO "SpamModel" (id,"userId",status,"sourceDigest","sourceMetadata","goodMessages","spamMessages","tokenizerVersion","importedWords","importedMessages","updatedAt") VALUES ($1,$2,'READY','synthetic','{}',10,10,'portable-1',200,20,NOW())`,
      [id, account.rows[0].userId],
    );
    inserted = true;
    await client.query(
      `UPDATE "EmailAccount" SET "spamFilterEnabled"=false WHERE id=$1`,
      [emailAccountId],
    );
    await markAutomationOnboardingViewed(page);
    await page.goto(`/${emailAccountId}/automation?tab=settings`);
    const card = getAutomationSettingsCard(page, "Learned spam filter");
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText(
      "20 imported messages, 200 learned tokens",
    );
    const toggle = card.getByRole("switch");
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect
      .poll(
        async () => {
          const result = await client.query(
            `SELECT "spamFilterEnabled" FROM "EmailAccount" WHERE id=$1`,
            [emailAccountId],
          );
          return result.rows[0].spamFilterEnabled;
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    await page.reload();
    await expect(card.getByRole("switch")).toBeChecked({ timeout: 60_000 });
    await card.screenshot({
      path: test.info().outputPath("spam-filter-enabled.png"),
    });
  } finally {
    if (inserted)
      await client.query(`DELETE FROM "SpamModel" WHERE id=$1`, [id]);
    await client.query(
      `UPDATE "EmailAccount" SET "spamFilterEnabled"=$2 WHERE id=$1`,
      [emailAccountId, account.rows[0].spamFilterEnabled],
    );
    await client.end();
  }
});
