import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccount } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";

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

for (const view of ["mail", "settings"]) {
  test(`opens settings from Command K in ${view} without leaving the page`, async ({
    page,
  }, testInfo) => {
    const { id: emailAccountId } = await getEmailAccount(page);
    const pathname = view === "mail" ? `/${emailAccountId}/mail` : "/settings";
    await page.goto(pathname);
    await expect(
      view === "mail"
        ? page.getByRole("listbox", { name: "Conversations" })
        : page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible({ timeout: 60_000 });

    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+KeyK`);
    const search = page.getByPlaceholder("Type a command or search...");
    await expect(search).toBeVisible();
    await search.fill("settings");
    await page.getByRole("option", { name: "Settings", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Email Accounts", exact: true }),
    ).toBeVisible();
    await expect(search).toBeHidden();
    expect(new URL(page.url()).pathname).toBe(pathname);
    await expect(page).toHaveURL(/settings=open/);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      `command-k-settings-${view}`,
    );

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(new URL(page.url()).pathname).toBe(pathname);
    await expect(page).not.toHaveURL(/settings=open/);
  });
}

test("opens mail from Command K", async ({ page }, testInfo) => {
  const { id: emailAccountId } = await getEmailAccount(page);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible({ timeout: 60_000 });

  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${modifier}+KeyK`);
  const search = page.getByPlaceholder("Type a command or search...");
  await expect(search).toBeVisible();
  await search.fill("go to mail");
  await page.getByRole("option", { name: "Go to Mail", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/${emailAccountId}/mail$`));
  await expect(
    page.getByRole("listbox", { name: "Conversations" }),
  ).toBeVisible({ timeout: 60_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "command-k-go-to-mail");
});
