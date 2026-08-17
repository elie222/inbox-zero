import { expect, test } from "@playwright/test";
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

test("persists the global appearance across reloads", async ({ page }) => {
  await openSettings(page);

  previousTheme = await page.evaluate(() => localStorage.getItem("theme"));
  const darkModeToggle = page.getByRole("switch", {
    name: "Toggle dark mode",
  });
  await expect(darkModeToggle).toBeEnabled();
  const enableDarkMode = !(await darkModeToggle.isChecked());
  const expectedTheme = enableDarkMode ? "dark" : "light";

  await darkModeToggle.click();
  await expect(darkModeToggle).toBeChecked({ checked: enableDarkMode });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("theme")))
    .toBe(expectedTheme);
  await expectThemeClass(page, enableDarkMode);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("switch", { name: "Toggle dark mode" }),
  ).toBeChecked({ checked: enableDarkMode });
  await expectThemeClass(page, enableDarkMode);
});

async function expectThemeClass(
  page: Parameters<typeof openSettings>[0],
  dark: boolean,
) {
  const html = page.locator("html");
  if (dark) await expect(html).toHaveClass(/dark/);
  else await expect(html).not.toHaveClass(/dark/);
}
