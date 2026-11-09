import { INITIAL_MAIL_SPLITS } from "@/utils/split-inbox/initial-splits";
import { expect, type Page } from "@playwright/test";
import { test } from "../playwright-test";
import { playwrightMailProvider } from "../mail-provider";
import { getEmailAccountId } from "../account-test-helpers";
import type { Client } from "pg";
import { withClient } from "./mail-test-helpers";

test.skip(
  playwrightMailProvider === "microsoft",
  "Hiding tabs from All is Gmail-only",
);

/** The labelling rules onboarding creates, and the emulator labels they use. */
const CATEGORY_RULES = [
  { systemType: "TO_REPLY", name: "To Reply", labelId: "Label_to_reply" },
  { systemType: "NEWSLETTER", name: "Newsletter", labelId: "Label_newsletter" },
  { systemType: "MARKETING", name: "Marketing", labelId: "Label_marketing" },
  { systemType: "CALENDAR", name: "Calendar", labelId: "Label_calendar" },
  { systemType: "RECEIPT", name: "Receipt", labelId: "Label_receipt" },
  {
    systemType: "NOTIFICATION",
    name: "Notification",
    labelId: "Label_notification",
  },
  { systemType: "COLD_EMAIL", name: "Cold Email", labelId: "Label_cold_email" },
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const emailAccountId = await getEmailAccountId(page);
  await withClient(async (client) => {
    await client.query('DELETE FROM "MailSplit" WHERE "emailAccountId" = $1', [
      emailAccountId,
    ]);
    await deleteCategoryRules(client, emailAccountId);
    for (const rule of CATEGORY_RULES) {
      const ruleId = `pw_setup_${rule.systemType}_${emailAccountId}`;
      await client.query(
        `INSERT INTO "Rule" (id, name, enabled, automate, "runOnThreads", "systemType",
           "emailAccountId", "createdAt", "updatedAt")
         VALUES ($1, $2, true, true, false, $3, $4, NOW(), NOW())`,
        [ruleId, rule.name, rule.systemType, emailAccountId],
      );
      await client.query(
        `INSERT INTO "Action" (id, type, "ruleId", "emailAccountId", label, "labelId",
           "createdAt", "updatedAt")
         VALUES ($1, 'LABEL', $2, $3, $4, $5, NOW(), NOW())`,
        [`${ruleId}_label`, ruleId, emailAccountId, rule.name, rule.labelId],
      );
    }
    // The tabs onboarding leaves a new account with, plus one with mail in it.
    const splits = [
      { name: "All", filter: null },
      { name: "Unread", filter: { kind: "UNREAD", value: null } },
      ...CATEGORY_RULES.map((rule) => ({
        name: rule.name,
        filter: { kind: "LABEL", value: rule.labelId },
      })),
      {
        name: "Project Alpha",
        filter: { kind: "LABEL", value: "Label_project" },
      },
    ];
    for (const [order, split] of splits.entries()) {
      const { rows } = await client.query(
        `INSERT INTO "MailSplit" (id, "updatedAt", "emailAccountId", name, "matchAll", "order")
         VALUES (gen_random_uuid()::text, NOW(), $1, $2, true, $3) RETURNING id`,
        [emailAccountId, split.name, order],
      );
      if (split.filter)
        await client.query(
          `INSERT INTO "MailSplitFilter" (id, "mailSplitId", kind, value, "order") VALUES (gen_random_uuid()::text, $1, $2, $3, 0)`,
          [rows[0].id, split.filter.kind, split.filter.value],
        );
    }
    await client.query(
      `UPDATE "EmailAccount" SET "mailSetup" = 'PENDING', "mailDefaultSplitId" = NULL,
         "mailLayout" = 'LIST', "mailBundleInbox" = NULL WHERE id = $1`,
      [emailAccountId],
    );
  });
});

test.afterEach(async ({ page }) => {
  const emailAccountId = await getEmailAccountId(page);
  await withClient(async (client) => {
    await deleteCategoryRules(client, emailAccountId);
    // Back to the tabs a fresh account starts with, for the specs that follow.
    await client.query('DELETE FROM "MailSplit" WHERE "emailAccountId" = $1', [
      emailAccountId,
    ]);
    for (const [order, split] of INITIAL_MAIL_SPLITS.entries()) {
      const { rows } = await client.query(
        `INSERT INTO "MailSplit" (id, "updatedAt", "emailAccountId", name, "matchAll", "order")
         VALUES (gen_random_uuid()::text, NOW(), $1, $2, true, $3) RETURNING id`,
        [emailAccountId, split.name, order],
      );
      for (const filter of split.filters.create)
        await client.query(
          `INSERT INTO "MailSplitFilter" (id, "mailSplitId", kind, value, "order") VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`,
          [rows[0].id, filter.kind, filter.value, filter.order],
        );
    }
    await client.query(
      `UPDATE "EmailAccount" SET "mailSetup" = 'DONE', "mailDefaultSplitId" = NULL,
         "mailLayout" = 'LIST', "mailBundleInbox" = NULL WHERE id = $1`,
      [emailAccountId],
    );
  });
});

test("walks a new mail user through setup with a live preview", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail`, { waitUntil: "domcontentloaded" });
  const panel = page.getByRole("region", { name: "Mail setup" });
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("listbox", { name: "Conversations" }),
  ).toBeVisible();
  await shot(page, testInfo, "1-layout");

  await panel.getByRole("button", { name: "Split" }).click();
  await expect(panel.getByRole("button", { name: "Split" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await shot(page, testInfo, "2-layout-split");

  await panel.getByRole("button", { name: "Next" }).click();
  await panel.getByRole("switch", { name: "Starred" }).click();
  await expect(
    page.locator("[data-split-name]", { hasText: /^Starred$/ }),
  ).toBeVisible();
  await shot(page, testInfo, "3-tabs");

  await panel.getByRole("button", { name: "Next" }).click();
  const projectThread = page
    .getByRole("listbox", { name: "Conversations" })
    .getByRole("option")
    .filter({ hasText: "Project Alpha" });
  await expect(projectThread).toHaveCount(1);
  await panel.getByRole("switch", { name: "Project Alpha" }).click();
  await expect(projectThread).toHaveCount(0);
  await shot(page, testInfo, "4-show-in-all");

  await panel.getByRole("button", { name: "Next" }).click();
  await panel.getByText("Unread", { exact: true }).click();
  await expect(panel.getByRole("radio", { name: "Unread" })).toBeChecked();
  await expect(page.locator('button[aria-current="true"]')).toContainText(
    "Unread",
  );
  await shot(page, testInfo, "5-default-tab");

  await panel.getByRole("button", { name: "Next" }).click();
  await panel.getByRole("switch", { name: "Bundle my inbox" }).click();
  await shot(page, testInfo, "6-bundles");

  await panel.getByRole("button", { name: "Done" }).click();
  await expect(panel).toBeHidden();

  // Done sticks, and the default tab is what the inbox opens on.
  await page.goto(`/${emailAccountId}/mail`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('button[aria-current="true"]')).toContainText(
    "Unread",
  );
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "View options" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Run mail setup again" }),
  ).toBeVisible();
  await shot(page, testInfo, "7-after-setup");
});

test("suggests setup to existing users without opening it", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await withClient((client) =>
    client.query(
      `UPDATE "EmailAccount" SET "mailSetup" = 'SUGGESTED' WHERE id = $1`,
      [emailAccountId],
    ),
  );
  await page.goto(`/${emailAccountId}/mail`, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("listbox", { name: "Conversations" }),
  ).toBeVisible({ timeout: 60_000 });
  const panel = page.getByRole("region", { name: "Mail setup" });
  await expect(panel).toBeHidden();
  await shot(page, testInfo, "8-suggested-button");

  await page.getByRole("button", { name: "View options" }).click();
  await page.getByRole("menuitem", { name: "Set up your inbox" }).click();
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/setup=1/);
});

async function shot(
  page: Page,
  testInfo: { outputPath: (name: string) => string },
  name: string,
) {
  await page.locator("nextjs-portal").evaluateAll((portals) => {
    for (const portal of portals) portal.remove();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
}

async function deleteCategoryRules(client: Client, emailAccountId: string) {
  await client.query(
    `DELETE FROM "Rule" WHERE "emailAccountId" = $1 AND "systemType" = ANY($2::"SystemType"[])`,
    [emailAccountId, CATEGORY_RULES.map((rule) => rule.systemType)],
  );
}
