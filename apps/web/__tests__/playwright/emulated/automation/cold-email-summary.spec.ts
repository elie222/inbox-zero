import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { Client } from "pg";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";

test("a weekly summary link excludes its sender only after confirmation", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const sender = "outreach+summary@example.com";
  const ruleId = randomUUID();
  const groupId = randomUUID();
  const senderId = randomUUID();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO "Group" (id, name, "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, 'Cold Email', $2, NOW(), NOW())`,
      [groupId, emailAccountId],
    );
    await client.query(
      `INSERT INTO "Rule" (id, name, "systemType", "emailAccountId", "groupId", "createdAt", "updatedAt")
       VALUES ($1, 'Cold Email', 'COLD_EMAIL', $2, $3, NOW(), NOW())`,
      [ruleId, emailAccountId, groupId],
    );
    await client.query(
      `INSERT INTO "GroupItem" (id, "groupId", type, value, "createdAt", "updatedAt")
       VALUES ($1, $2, 'FROM', $3, NOW(), NOW())`,
      [senderId, groupId, sender],
    );

    const url = `/${emailAccountId}/cold-email-blocker?${new URLSearchParams({ "not-cold": senderId })}`;
    const dialog = page.getByRole("alertdialog", {
      name: "Mark Not Cold Email",
    });
    const forgedSender = "unflagged@example.com";
    const lookup = page.waitForResponse(
      (response) =>
        new URL(response.url()).searchParams.get("senderId") === forgedSender,
    );
    await page.goto(
      `/${emailAccountId}/cold-email-blocker?${new URLSearchParams({ "not-cold": forgedSender })}`,
    );
    const lookupResponse = await lookup;
    expect((await lookupResponse.json()).coldEmails).toEqual([]);
    await expect(dialog).toBeHidden();

    await page.goto(url);
    await expect(dialog).toContainText(sender);
    await capturePlaywrightCheckpoint(page, testInfo, "not-cold-confirmation");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/not-cold=/);
    const flagged = page.getByRole("row").filter({ hasText: sender });
    await expect(flagged).toBeVisible();

    await page.goto(url);
    await dialog.getByRole("button", { name: "Not cold email" }).click();
    await expect(dialog).toBeHidden();
    await expect(flagged).toHaveCount(0);
    await page.getByRole("link", { name: "Marked Not Cold" }).click();
    await expect(flagged).toBeVisible();

    const replayLookup = page.waitForResponse(
      (response) =>
        new URL(response.url()).searchParams.get("senderId") === senderId,
    );
    await page.goto(url);
    const replayResponse = await replayLookup;
    expect((await replayResponse.json()).coldEmails).toEqual([]);
    await expect(dialog).toBeHidden();
  } finally {
    await client.query(`DELETE FROM "Rule" WHERE id = $1`, [ruleId]);
    await client.query(`DELETE FROM "Group" WHERE id = $1`, [groupId]);
    await client.end();
  }
});
