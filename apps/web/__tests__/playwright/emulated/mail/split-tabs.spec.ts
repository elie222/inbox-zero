import { expect, test } from "@playwright/test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("shows description entry and creates a manual split", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);

  await page.getByRole("button", { name: "New split" }).click();

  const description = page.getByRole("textbox", {
    name: "Describe this split",
  });
  await description.fill("Posts from social networks");
  await expect(
    page.getByRole("button", { name: "Create split from description" }),
  ).toBeEnabled();
  await expect(page.getByText(/Compiling/)).toBeHidden();
  // Keep Next's development indicator out of product screenshots.
  await page.locator("nextjs-portal").evaluateAll((portals) => {
    for (const portal of portals) portal.remove();
  });
  await page.screenshot({
    path: testInfo.outputPath("mail-new-split-description.png"),
  });

  await page.getByRole("button", { name: "Choose manually" }).click();
  await page.getByRole("option", { name: "Promotions", exact: true }).click();
  await expect(
    page.getByText("Shows mail in the Promotions category"),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("mail-new-split-manual-selection.png"),
  });

  await page.getByRole("button", { name: "Add split" }).click();
  const promotionsSplit = page.getByRole("button", {
    name: "Promotions",
    exact: true,
  });
  await expect(promotionsSplit).toBeVisible();

  await promotionsSplit.click();
  await expect(promotionsSplit).toHaveAttribute("aria-current", "true");
  await expect(
    conversationWithSubject(page, conversations, "Promotion Category Message"),
  ).toBeVisible();
  await expect(conversations.getByRole("option")).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("mail-new-split-created.png"),
  });

  await page
    .getByRole("button", { name: "Remove the Promotions split" })
    .click();
  await expect(promotionsSplit).toHaveCount(0);
});
