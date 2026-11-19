import { expect } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  getAutomationSettingsCard,
  markAutomationOnboardingViewed,
} from "./automation-tabs-test-helpers";

const RULE_NAME = "Playwright learned exclusions";
const GROUP_ID = "playwright-learned-exclusions-group";
const RULE_ID = "playwright-learned-exclusions-rule";
const LEARNED_ITEM_ID = "playwright-learned-exclusion";
const LEARNED_SENDER = "removed-label@example.com";
const MANUAL_SENDER = "manual-exclusion@example.com";

test.afterEach(async () => {
  await withClient(deleteSeed);
});

test("shows exclusions learned from label removals and undoes them", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await withClient(async (client) => {
    await deleteSeed(client);
    await seed(client, emailAccountId);
  });
  await markAutomationOnboardingViewed(page);

  await page.goto(`/${emailAccountId}/automation?tab=settings`);
  await getAutomationSettingsCard(page, "Learned patterns")
    .getByRole("button", { name: "View", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Learned patterns",
    exact: true,
  });
  const learnedRow = dialog
    .getByRole("row")
    .filter({ hasText: LEARNED_SENDER });
  const manualRow = dialog.getByRole("row").filter({ hasText: MANUAL_SENDER });

  await expect(learnedRow).toContainText("Learned from label removal");
  await expect(manualRow).toBeVisible();
  await expect(manualRow).not.toContainText("Learned from label removal");
  await expect(
    manualRow.getByRole("button", {
      name: `Undo exclusion for ${MANUAL_SENDER}`,
    }),
  ).toHaveCount(0);
  await learnedRow.scrollIntoViewIfNeeded();
  await capturePlaywrightCheckpoint(page, testInfo, "learned-exclusions");

  await learnedRow
    .getByRole("button", { name: `Undo exclusion for ${LEARNED_SENDER}` })
    .click();

  await expect(learnedRow).toHaveCount(0);
  await expect(manualRow).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "learned-exclusion-undone");

  const remaining = await withClient((client) =>
    client.query<{ id: string }>(
      `SELECT id FROM "GroupItem" WHERE "groupId" = $1 ORDER BY id`,
      [GROUP_ID],
    ),
  );
  expect(remaining.rows.map((row) => row.id)).not.toContain(LEARNED_ITEM_ID);
  expect(remaining.rows).toHaveLength(2);
});

async function seed(client: Client, emailAccountId: string) {
  await client.query(
    `INSERT INTO "Group" (id, name, "emailAccountId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [GROUP_ID, RULE_NAME, emailAccountId],
  );
  await client.query(
    `INSERT INTO "Rule"
       (id, name, enabled, automate, "runOnThreads", instructions,
        "emailAccountId", "groupId", "createdAt", "updatedAt")
     VALUES ($1, $2, true, true, false, 'Newsletters', $3, $4,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [RULE_ID, RULE_NAME, emailAccountId, GROUP_ID],
  );
  await client.query(
    `INSERT INTO "GroupItem"
       (id, "groupId", type, value, exclude, source, reason, "createdAt", "updatedAt")
     VALUES
       ($1, $2, 'FROM', $3, true, 'LABEL_REMOVED', 'Label removed',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('playwright-manual-exclusion', $2, 'FROM', $4, true, 'USER', NULL,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('playwright-learned-inclusion', $2, 'FROM', 'news@example.com', false,
        'AI', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [LEARNED_ITEM_ID, GROUP_ID, LEARNED_SENDER, MANUAL_SENDER],
  );
}

async function deleteSeed(client: Client) {
  await client.query(`DELETE FROM "Rule" WHERE id = $1`, [RULE_ID]);
  await client.query(`DELETE FROM "Group" WHERE id = $1`, [GROUP_ID]);
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
