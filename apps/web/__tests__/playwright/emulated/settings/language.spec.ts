import { expect, type Page } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { openSettings } from "./settings-test-helpers";

test("switches the app language from settings and keeps it across reloads", async ({
  page,
}, testInfo) => {
  await openSettings(page);

  await chooseLanguage(page, "Language", "Español");

  // The page heading and tab title render on the server, the sections on
  // the client.
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("heading", { name: "Cuentas de correo", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Configuración/);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "settings-spanish");

  await chooseLanguage(page, "Idioma", "English");

  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Email Accounts", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

// Settings sections above the picker load after the page renders, so the open
// menu can shift out of view. Choosing by keyboard doesn't depend on where it lands.
async function chooseLanguage(page: Page, label: string, language: string) {
  await page.getByRole("combobox", { name: label }).press("Enter");
  await page.getByRole("option", { name: language }).press("Enter");
}
