import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openSettings } from "../settings/settings-test-helpers";
import { openMail } from "./mail-test-helpers";

test("the settings switches control tooltips and the always-visible email checkbox", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  const tooltips = page.getByRole("switch", { name: "Toggle tooltips" });
  const checkboxes = page.getByRole("switch", {
    name: "Toggle always showing email checkboxes",
  });
  await expect(tooltips).toBeChecked();
  await expect(checkboxes).not.toBeChecked();

  await tooltips.click();
  await checkboxes.click();
  await capturePlaywrightCheckpoint(page, testInfo, "Interface settings");

  const { conversations } = await openMail(page);
  const rowCheckbox = conversations.getByRole("checkbox").first();
  await expect(rowCheckbox).toHaveCSS("opacity", "1");

  // The tap area reaches past the 14px square.
  const box = await rowCheckbox.boundingBox();
  if (!box) throw new Error("The row checkbox has no bounding box");
  await page.mouse.click(box.x - 6, box.y + box.height / 2);
  await expect(rowCheckbox).toBeChecked();
  await rowCheckbox.click();
  await expect(rowCheckbox).not.toBeChecked();

  await page
    .getByRole("button", { name: "Expand or shorten preview text" })
    .hover();
  await page.waitForTimeout(600);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "Mail without tooltips");

  await openSettings(page);
  await page.getByRole("switch", { name: "Toggle tooltips" }).click();
  await page
    .getByRole("switch", {
      name: "Toggle always showing email checkboxes",
    })
    .click();
  await openMail(page);
  await expect(
    page
      .getByRole("listbox", { name: "Conversations" })
      .getByRole("checkbox")
      .first(),
  ).toHaveCSS("opacity", "0");
  await page
    .getByRole("button", { name: "Expand or shorten preview text" })
    .hover();
  await expect(page.getByRole("tooltip").first()).toBeVisible();
});
