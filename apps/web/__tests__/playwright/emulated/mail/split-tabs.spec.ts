import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  cleanupDefaultSplitRule,
  conversationWithSubject,
  openMail,
  seedDefaultSplitRule,
} from "./mail-test-helpers";

let defaultSplitEmailAccountId: string | undefined;

test.afterEach(async () => {
  if (!defaultSplitEmailAccountId) return;
  await cleanupDefaultSplitRule(defaultSplitEmailAccountId);
  defaultSplitEmailAccountId = undefined;
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

test("shows a combined picker and creates a matching split", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);

  await page.getByRole("button", { name: "New split" }).click();

  const search = page.getByRole("combobox", {
    name: "Search or describe a split",
  });
  await expect(
    page.getByRole("option", { name: "Promotions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Project Alpha", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Compiling/)).toBeHidden();
  // Keep Next's development indicator out of product screenshots.
  await page.locator("nextjs-portal").evaluateAll((portals) => {
    for (const portal of portals) portal.remove();
  });
  await capturePlaywrightCheckpoint(page, testInfo, "mail-new-split-initial");

  await search.fill("Posts from social networks");
  await expect(
    page.getByRole("option", {
      name: "Create “Posts from social networks”",
    }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-new-split-description",
  );

  await search.fill("Promotions");
  const promotionsOption = page.getByRole("option", {
    name: "Promotions",
    exact: true,
  });
  await expect(promotionsOption).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-new-split-existing-option",
  );

  await promotionsOption.click();
  const promotionsSplit = page.getByRole("button", {
    name: "Promotions",
    exact: true,
  });
  await expect(promotionsSplit).toBeVisible();

  await promotionsSplit.click();
  await expect(promotionsSplit).toHaveAttribute("aria-current", "true");
  await expect(
    conversationWithSubject(page, conversations, "Promotion Category Message"),
  ).toBeVisible();
  await expect(conversations.getByRole("option")).toHaveCount(1);
  await capturePlaywrightCheckpoint(page, testInfo, "mail-new-split-created");

  await page
    .getByRole("button", { name: "Remove the Promotions split" })
    .click();
  await expect(promotionsSplit).toHaveCount(0);
});

test("organizes split choices and manages all rule labels", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await seedDefaultSplitRule(emailAccountId);
  defaultSplitEmailAccountId = emailAccountId;
  await openMail(page);

  await page.getByRole("button", { name: "New split" }).click();

  await expect(page.getByText("State", { exact: true })).toHaveCount(0);
  const headingElements = page.locator("[cmdk-group-heading]");
  await expect(headingElements.filter({ hasText: /^Labels/ })).toBeVisible();
  await expect(
    headingElements.filter({ hasText: /^Categories$/ }),
  ).toBeVisible();
  const groupHeadings = await headingElements.allTextContents();
  expect(
    groupHeadings.findIndex((heading) => heading.startsWith("Labels")),
  ).toBeLessThan(
    groupHeadings.findIndex((heading) => heading.startsWith("Categories")),
  );

  await page.getByRole("option", { name: "Add all" }).click();
  const calendarSplit = page.getByRole("button", {
    name: "Calendar",
    exact: true,
  });
  await expect(calendarSplit).toBeVisible();
  await page.getByRole("button", { name: "New split" }).click();
  await expect(page.getByRole("option", { name: "Remove all" })).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-rule-label-splits-added",
  );

  await page.getByRole("option", { name: "Remove all" }).click();
  await expect(calendarSplit).toHaveCount(0);
});
