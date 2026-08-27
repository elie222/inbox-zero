import { expect, test } from "@playwright/test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("shows a combined picker and creates a matching split", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);

  await page.getByRole("button", { name: "New split" }).click();

  const search = page.getByRole("combobox", {
    name: "Search or describe a split",
  });
  await search.fill("Posts from social networks");
  await expect(
    page.getByRole("option", {
      name: "Create “Posts from social networks”",
    }),
  ).toBeVisible();
  await expect(page.getByText(/Compiling/)).toBeHidden();
  // Keep Next's development indicator out of product screenshots.
  await page.locator("nextjs-portal").evaluateAll((portals) => {
    for (const portal of portals) portal.remove();
  });
  await page.screenshot({
    path: testInfo.outputPath("mail-new-split-description.png"),
  });

  await search.fill("Promotions");
  const promotionsOption = page.getByRole("option", {
    name: "Promotions",
    exact: true,
  });
  await expect(promotionsOption).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("mail-new-split-existing-option.png"),
  });

  await promotionsOption.click();
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
