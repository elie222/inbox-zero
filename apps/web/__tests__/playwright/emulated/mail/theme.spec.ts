import { expect, type Locator } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { openMail } from "./mail-test-helpers";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "./account-test-helpers";

const commandModifier = process.platform === "darwin" ? "Meta" : "Control";

test("uses muted account colors with a neutral combined inbox and matching reader", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail`);
  await expect(
    page.getByRole("listbox", { name: "Conversations" }),
  ).toBeVisible({ timeout: 120_000 });
  const second = await createSecondEmailAccount(emailAccountId);
  const frame = page.locator(".mail-shell");
  const hue = (target: Locator) =>
    target.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--mail-hue").trim(),
    );
  const background = (target: Locator) =>
    target.evaluate((element) => getComputedStyle(element).backgroundColor);

  try {
    await page.reload();
    const primaryHue = await hue(frame);
    const primaryBackground = await background(frame);
    await capturePlaywrightCheckpoint(page, testInfo, "muted-primary-inbox");

    await page.goto(`/${second.id}/mail`);
    await expect(
      page.getByRole("listbox", { name: "Conversations" }),
    ).toBeVisible();
    await expect.poll(() => hue(frame)).not.toBe(primaryHue);
    const secondaryHue = await hue(frame);
    expect(await background(frame)).not.toBe(primaryBackground);
    await capturePlaywrightCheckpoint(page, testInfo, "muted-secondary-inbox");

    await page.goto(`/${emailAccountId}/mail?accountScope=all&split=all`);
    await expect.poll(() => background(frame)).toBe("rgb(33, 33, 33)");
    const primaryRow = page
      .locator(`[data-mail-account-id="${emailAccountId}"] [role="option"]`)
      .first();
    const secondaryRow = page
      .locator(`[data-mail-account-id="${second.id}"] [role="option"]`)
      .first();
    await expect(primaryRow).toBeVisible();
    await expect(secondaryRow).toBeVisible();
    expect(await hue(primaryRow)).toBe(primaryHue);
    expect(await hue(secondaryRow)).toBe(secondaryHue);

    await page
      .getByRole("button", { name: "Switch list or split view" })
      .click();
    for (const [row, accountId, accountHue] of [
      [primaryRow, emailAccountId, primaryHue],
      [secondaryRow, second.id, secondaryHue],
    ] as const) {
      await row.click();
      const reader = page.locator(
        `[data-mail-reader-account-id="${accountId}"]`,
      );
      await expect(reader.locator("[data-mail-reader]")).toBeVisible();
      expect(await hue(reader)).toBe(accountHue);
      const channels = (await background(reader)).match(/\d+/g)!.map(Number);
      expect(Math.max(...channels)).toBeLessThan(60);
      expect(Math.max(...channels) - Math.min(...channels)).toBeLessThan(20);
    }
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "neutral-combined-inbox-colored-preview",
    );
    await page.reload();
    await expect.poll(() => background(frame)).toBe("rgb(33, 33, 33)");
    await expect(
      page.getByRole("button", { name: "All accounts", exact: true }),
    ).toBeVisible();
  } finally {
    await deleteSecondEmailAccount(second.accountId);
  }
});

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
