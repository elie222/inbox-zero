import { expect, type Page } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccount } from "../account-test-helpers";
import { playwrightMailProvider } from "../mail-provider";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { openMail } from "../mail/mail-test-helpers";
import {
  getEmailAccountSettingsCard,
  openSettings,
} from "./settings-test-helpers";

const LABEL_NAME = "To Reply";

test("resets a recolored To Reply label to its default color", async ({
  page,
}, testInfo) => {
  test.skip(
    playwrightMailProvider === "microsoft",
    "Covers the Gmail label flow",
  );
  const { email } = await getEmailAccount(page);

  await openMail(page);
  const label = page.getByRole("link", { name: LABEL_NAME, exact: true });
  if ((await label.count()) === 0) {
    await page.getByRole("button", { name: "Create label" }).click();
    await page
      .getByRole("textbox", { name: "New label name" })
      .fill(LABEL_NAME);
    await page.getByRole("button", { name: "Add", exact: true }).click();
  }
  await expect(label).toBeVisible({ timeout: 60_000 });

  await label.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit label" });
  await editDialog.getByRole("radio", { name: "Red", exact: true }).click();
  await editDialog.getByRole("button", { name: "Save" }).click();
  await expect(editDialog).toBeHidden();
  await expect.poll(() => getLabelDotColor(page)).toBe("rgb(230, 101, 80)");
  await capturePlaywrightCheckpoint(page, testInfo, "to-reply-recolored-red");

  await openSettings(page);
  const accountCard = getEmailAccountSettingsCard(page, email);
  await expect(accountCard.toggle).toBeVisible({ timeout: 60_000 });
  await accountCard.toggle.click();
  const resetItem = accountCard.card
    .locator('[data-slot="item"]')
    .filter({ hasText: "Reset Label Colors" });
  await expect(resetItem).toBeVisible({ timeout: 60_000 });
  await resetItem.scrollIntoViewIfNeeded();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "reset-label-colors-setting",
  );

  await resetItem.getByRole("button", { name: "Reset" }).click();
  await expect(
    page.getByText(/Reset \d+ labels? to the default colors\./),
  ).toBeVisible({ timeout: 60_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "reset-label-colors-done");

  await openMail(page);
  await expect(label).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => getLabelDotColor(page)).toBe("rgb(179, 239, 211)");
  await capturePlaywrightCheckpoint(page, testInfo, "to-reply-default-green");
});

function getLabelDotColor(page: Page) {
  return page
    .getByRole("link", { name: LABEL_NAME, exact: true })
    .locator("span.rounded-full")
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
}
