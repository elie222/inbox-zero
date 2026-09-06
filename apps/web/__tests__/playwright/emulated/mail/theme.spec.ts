import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

const commandModifier = process.platform === "darwin" ? "Meta" : "Control";

test("Command K changes the mail theme and remembers it after reload", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openMail(page);

  const palette = page.getByRole("dialog");
  await page.keyboard.press(`${commandModifier}+KeyK`);
  await palette.getByPlaceholder("Type a command or search...").fill("dark");
  await palette.getByRole("option", { name: "Set Theme: Dark" }).click();
  await expect(palette).toBeHidden();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await capturePlaywrightCheckpoint(page, testInfo, "Mail in dark mode");

  await page.reload();
  await expect(
    page.getByRole("listbox", { name: "Conversations" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.keyboard.press(`${commandModifier}+KeyK`);
  await palette.getByPlaceholder("Type a command or search...").fill("theme");
  await capturePlaywrightCheckpoint(
    palette,
    testInfo,
    "Theme commands in dark mode",
  );
  await palette.getByRole("option", { name: "Set Theme: Light" }).click();
  await expect(palette).toBeHidden();
  await expect(page.locator("html")).toHaveClass(/light/);

  await page.keyboard.press(`${commandModifier}+KeyK`);
  await palette.getByPlaceholder("Type a command or search...").fill("system");
  await palette.getByRole("option", { name: "Set Theme: System" }).click();
  await expect(palette).toBeHidden();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
});
