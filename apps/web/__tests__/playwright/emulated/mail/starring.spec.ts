import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("toggles a star with S and the command palette while preserving unread", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const row = conversationWithSubject(
    page,
    conversations,
    "Second Unread Command Message",
  );
  await row.getByRole("checkbox").click();
  await page.keyboard.press("s");
  await expect(
    row.getByText("Starred conversation", { exact: true }),
  ).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  });
  await capturePlaywrightCheckpoint(page, testInfo, "starred-and-unread-dots");
  await row.getByRole("checkbox").click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Type a command or search...").fill("star");
  await page.getByRole("option", { name: /^Unstar/ }).click();
  await expect(
    row.getByText("Starred conversation", { exact: true }),
  ).toHaveCount(0);
});
