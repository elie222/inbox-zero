import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { openSettings } from "./settings-test-helpers";

let previousTheme: string | null | undefined;

test.beforeEach(() => {
  previousTheme = undefined;
});

test.afterEach(async ({ page }) => {
  if (previousTheme === undefined) return;

  await page.evaluate((theme) => {
    if (theme === null) localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  }, previousTheme);
  await page.reload();
});

test("persists the chosen theme across reloads and follows the system in system mode", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openSettings(page);

  previousTheme = await page.evaluate(() => localStorage.getItem("theme"));
  const themeSelect = page.getByRole("combobox", { name: "Theme" });
  await expect(themeSelect).toBeEnabled();

  await chooseTheme(page, "Dark");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("theme")))
    .toBe("dark");
  await expectThemeClass(page, true);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(themeSelect).toHaveText("Dark");
  await expectThemeClass(page, true);

  await chooseTheme(page, "Light");
  await expectThemeClass(page, false);

  await chooseTheme(page, "System");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("theme")))
    .toBe("system");
  await expectThemeClass(page, false);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectThemeClass(page, true);
});

async function chooseTheme(
  page: Parameters<typeof openSettings>[0],
  name: "System" | "Light" | "Dark",
) {
  await page.getByRole("combobox", { name: "Theme" }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

async function expectThemeClass(
  page: Parameters<typeof openSettings>[0],
  dark: boolean,
) {
  const html = page.locator("html");
  if (dark) await expect(html).toHaveClass(/dark/);
  else await expect(html).not.toHaveClass(/dark/);
}
