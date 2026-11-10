import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { openSettings } from "./settings-test-helpers";

test("switches the app language from settings and keeps it across reloads", async ({
  page,
}, testInfo) => {
  await openSettings(page);

  await page.getByRole("combobox", { name: "Language" }).click();
  await page.getByRole("option", { name: "Español" }).click();

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

  await page.getByRole("combobox", { name: "Idioma" }).click();
  await page.getByRole("option", { name: "English" }).click();

  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Email Accounts", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
