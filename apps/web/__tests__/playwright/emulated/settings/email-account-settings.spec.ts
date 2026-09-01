import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import {
  cleanUpSettingsFixture,
  getEmailAccountSettingsCard,
  getSettingsDatabaseState,
  openSettings,
  prepareSettingsFixture,
  type SettingsFixture,
} from "./settings-test-helpers";

let fixture: SettingsFixture | undefined;

test.beforeEach(async ({ page }) => {
  fixture = undefined;
  fixture = await prepareSettingsFixture(page);
});

test.afterEach(async () => {
  if (fixture) await cleanUpSettingsFixture(fixture);
});

test("persists draft cleanup settings and disables all account rules", async ({
  page,
}) => {
  if (!fixture) throw new Error("The Settings fixture was not prepared");
  const settingsFixture = fixture;
  await openSettings(page);

  let accountCard = getEmailAccountSettingsCard(page, settingsFixture.email);
  await expect(accountCard.toggle).toBeVisible({ timeout: 60_000 });
  await accountCard.toggle.click();

  let cleanupDaysInput = accountCard.card.getByRole("spinbutton", {
    name: "Draft cleanup age in days",
  });
  await expect(cleanupDaysInput).toHaveValue("7", { timeout: 60_000 });
  await cleanupDaysInput.fill("21");
  await cleanupDaysInput
    .locator('xpath=ancestor::*[@data-slot="item-actions"]')
    .getByRole("button", { name: "Save" })
    .click();
  await expect(
    page.getByText("Draft cleanup settings updated.", { exact: true }),
  ).toBeVisible({ timeout: 60_000 });

  const disableRulesItem = accountCard.card
    .locator('[data-slot="item"]')
    .filter({ hasText: "Disable All Rules" });
  await expect(disableRulesItem).toBeVisible({ timeout: 60_000 });
  await disableRulesItem.getByRole("button", { name: "Disable All" }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Disable all rules?",
  });
  await confirmation.getByRole("button", { name: "Disable All" }).click();
  await expect(
    page.getByText("All rules disabled", { exact: true }),
  ).toBeVisible({ timeout: 60_000 });

  await expect
    .poll(() => getSettingsDatabaseState(settingsFixture))
    .toEqual({
      draftCleanupDays: 21,
      followUpAwaitingReplyDays: null,
      followUpNeedsReplyDays: null,
      ruleEnabled: false,
    });

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  accountCard = getEmailAccountSettingsCard(page, settingsFixture.email);
  await expect(accountCard.toggle).toBeVisible({ timeout: 60_000 });
  await accountCard.toggle.click();
  cleanupDaysInput = accountCard.card.getByRole("spinbutton", {
    name: "Draft cleanup age in days",
  });
  await expect(cleanupDaysInput).toHaveValue("21", { timeout: 60_000 });
  await expect(accountCard.card.getByText("Disable All Rules")).toHaveCount(0);
});
