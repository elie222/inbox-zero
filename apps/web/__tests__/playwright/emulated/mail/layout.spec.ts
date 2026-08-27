import { expect, test } from "@playwright/test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("switches between list, split, and focused reading layouts", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const emptyReader = page.getByText("Nothing selected", { exact: true });
  await expect(emptyReader).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath("mail-list-layout.png"),
  });

  await page.getByRole("button", { name: "Switch list or split view" }).click();
  await expect(emptyReader).toBeVisible();
  await expect(conversations).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("mail-split-layout.png"),
  });

  await conversationWithSubject(
    page,
    conversations,
    "Project Label Message",
  ).click();
  await expect(
    page.getByRole("heading", { name: "Project Label Message" }),
  ).toBeVisible();
  const messageBody = page
    .locator("pre")
    .getByText("This conversation is visible in the seeded project label.", {
      exact: true,
    });
  await expect(messageBody).toBeVisible();
  await expect(conversations).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("mail-selected-conversation-layout.png"),
  });

  await page.getByRole("button", { name: /^Focus mode/ }).click();
  await expect(conversations).toBeHidden();
  await expect(
    page.getByRole("button", { name: /^Exit focus mode/ }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("mail-focus-layout.png"),
  });

  await page.getByRole("button", { name: /^Exit focus mode/ }).click();
  await expect(conversations).toBeVisible();
  await page.getByRole("button", { name: "Switch list or split view" }).click();
  await page.getByRole("button", { name: /^Back/ }).click();
  await expect(conversations).toBeVisible();
});
