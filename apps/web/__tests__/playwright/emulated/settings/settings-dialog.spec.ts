import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccount } from "../account-test-helpers";

test("opens settings in a dialog from a url and from the nav", async ({
  page,
}) => {
  const { id: emailAccountId, email } = await getEmailAccount(page);
  const dialog = page.getByRole("dialog");
  const dialogHeading = dialog.getByRole("heading", {
    name: "Email Accounts",
    exact: true,
  });

  await page.goto(`/${emailAccountId}/mail?settings=open`);
  await expect(dialogHeading).toBeVisible({ timeout: 60_000 });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/settings=open/);

  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await page
    .locator('[data-sidebar="footer"]')
    .getByRole("button")
    .filter({ hasText: email })
    .click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/settings=open/);
  await expect(dialogHeading).toBeVisible();

  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/settings=open/);
});
