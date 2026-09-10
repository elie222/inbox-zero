import { INITIAL_MAIL_SPLITS } from "@/utils/mail/initial-splits";
import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  cleanupDefaultSplitRule,
  conversationWithSubject,
  openMail,
  seedDefaultSplitRule,
  withClient,
} from "./mail-test-helpers";

let defaultSplitEmailAccountId: string | undefined;

test.beforeEach(async ({ page }) => {
  const emailAccountId = await getEmailAccountId(page);
  await withClient(async (client) => {
    await client.query('DELETE FROM "MailSplit" WHERE "emailAccountId" = $1', [
      emailAccountId,
    ]);
    for (const [order, split] of INITIAL_MAIL_SPLITS.entries()) {
      const { rows } = await client.query(
        `INSERT INTO "MailSplit" (id, "updatedAt", "emailAccountId", name, "matchAll", "order")
         VALUES (gen_random_uuid()::text, NOW(), $1, $2, true, $3) RETURNING id`,
        [emailAccountId, split.name, order],
      );
      const splitId = rows.at(0)?.id;
      if (!splitId) throw new Error("Could not initialize split fixture");
      for (const filter of split.filters.create) {
        await client.query(
          `INSERT INTO "MailSplitFilter" (id, "mailSplitId", kind, value, "order") VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`,
          [splitId, filter.kind, filter.value, filter.order],
        );
      }
    }
  });
});

test.afterEach(async () => {
  if (!defaultSplitEmailAccountId) return;
  await cleanupDefaultSplitRule(defaultSplitEmailAccountId);
  defaultSplitEmailAccountId = undefined;
});

/** Next's dev indicator otherwise lands in every product screenshot. */
async function hideDevIndicator(page: Parameters<typeof openMail>[0]) {
  await page.locator("nextjs-portal").evaluateAll((portals) => {
    for (const portal of portals) portal.remove();
  });
}

test("restores a deleted All tab and protects it from removal", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await withClient((client) =>
    client.query(
      'DELETE FROM "MailSplit" WHERE "emailAccountId" = $1 AND name = $2',
      [emailAccountId, "All"],
    ),
  );
  await openMail(page);
  const allTab = page
    .locator("button[data-split-tab]")
    .filter({ hasText: /^All$/ });
  await expect(allTab).toBeVisible();
  await allTab.click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Turn off split" }),
  ).toBeHidden();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-protected-all-split");
});

test("moves focus with the active split when cycling by keyboard", async ({
  page,
}, testInfo) => {
  await openMail(page);

  const activeSplit = page.locator('button[aria-current="true"]');
  await expect(activeSplit).toBeVisible();
  await activeSplit.click();

  await page.keyboard.press("Tab");

  await expect(activeSplit).toBeFocused();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-split-keyboard-focus",
  );
});

test("builds a split from conditions and shows only matching mail", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);

  await page.getByRole("button", { name: "New split" }).click();
  await expect(page.getByText("New split inbox")).toBeVisible();
  await expect(page.getByText(/Compiling/)).toBeHidden();
  await hideDevIndicator(page);
  await capturePlaywrightCheckpoint(page, testInfo, "mail-new-split-library");

  await page.getByRole("button", { name: "Build your own" }).click();
  await expect(page.getByText("Show mail matching")).toBeVisible();

  await page.getByLabel("Condition field").first().selectOption("CATEGORY");
  await page.getByLabel("Condition value").first().selectOption({
    label: "Promotions",
  });
  await page.getByLabel("Split name").fill("Promos");
  await capturePlaywrightCheckpoint(page, testInfo, "mail-new-split-builder");

  await page.getByRole("button", { name: "Add split" }).click();

  const promosSplit = page.getByRole("button", { name: "Promos", exact: true });
  await expect(promosSplit).toBeVisible();
  await expect(promosSplit).toHaveAttribute("aria-current", "true");
  await expect(
    conversationWithSubject(page, conversations, "Promotion Category Message"),
  ).toBeVisible();
  await expect(conversations.getByRole("option")).toHaveCount(1);
  await hideDevIndicator(page);
  await capturePlaywrightCheckpoint(page, testInfo, "mail-new-split-created");

  // The tab's own menu edits the split rather than sending you back to the list.
  await promosSplit.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Edit filters and name" }).click();
  await expect(page.getByText("Edit split")).toBeVisible();
  await expect(page.getByLabel("Condition value").first()).toHaveValue(
    /PROMOTIONS/,
  );
  await hideDevIndicator(page);
  await capturePlaywrightCheckpoint(page, testInfo, "mail-split-edit");

  await page.getByRole("button", { name: "Add condition" }).click();
  await expect(page.getByLabel("Condition field")).toHaveCount(2);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(promosSplit).toBeVisible();

  await promosSplit.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Turn off split" }).click();
  await expect(promosSplit).toHaveCount(0);
});

test("turns a prepared split on from the library", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await seedDefaultSplitRule(emailAccountId);
  defaultSplitEmailAccountId = emailAccountId;
  await openMail(page);

  await page.getByRole("button", { name: "New split" }).click();
  await page.getByRole("button", { name: "General", exact: true }).click();

  // The library only offers label-backed entries when the account has that
  // label; the fixture's label is "Project Alpha", so use one needing none.
  const starredTile = page.getByRole("button", {
    name: "Turn on the Starred split",
  });
  await expect(starredTile).toBeVisible();
  await hideDevIndicator(page);
  await capturePlaywrightCheckpoint(page, testInfo, "mail-split-library");

  await starredTile.click();
  await expect(
    page.getByRole("button", { name: "Turn off the Starred split" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  const starredSplit = page.getByRole("button", {
    name: "Starred",
    exact: true,
  });
  await expect(starredSplit).toBeVisible();
  await hideDevIndicator(page);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-rule-label-splits-added",
  );

  await starredSplit.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Turn off split" }).click();
  await expect(starredSplit).toHaveCount(0);
});

test("reorders splits with arrows and dragging and persists tab order", async ({
  page,
}, testInfo) => {
  await openMail(page);
  const tabs = page.locator("button[data-split-tab]");
  const original = await tabs.allTextContents();
  expect(original.length).toBeGreaterThan(1);
  await page.getByRole("button", { name: "New split", exact: true }).click();
  const list = page.getByRole("list", { name: "Split order" });
  await page
    .getByRole("button", { name: `Move ${original[0]} down`, exact: true })
    .click();
  await expect(list).toHaveAttribute("aria-busy", "false");
  const expected = [original[1], original[0], ...original.slice(2)];
  await expect(tabs).toHaveText(expected);
  await expect(
    page.getByRole("button", { name: "Turn off the All split", exact: true }),
  ).toBeDisabled();
  await hideDevIndicator(page);
  await capturePlaywrightCheckpoint(page, testInfo, "mail-sortable-splits");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(tabs).toHaveText(expected);
  await page.getByRole("button", { name: "New split", exact: true }).click();
  const rows = list.getByRole("listitem");
  await rows.nth(0).locator("[data-drag-split]").dragTo(rows.nth(1));
  await expect(tabs).toHaveText(original);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(tabs).toHaveText(original);
});
