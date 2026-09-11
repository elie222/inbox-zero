import { expect, type Page } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  conversationWithSubject,
  openMail,
  readLatestMailMutation,
} from "./mail-test-helpers";

test("toggles a star with S and the command palette while preserving unread", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const row = conversationWithSubject(
    page,
    conversations,
    "Second Unread Command Message",
  );
  const starStatus = row.getByText("Starred conversation", { exact: true });
  if (await starStatus.count()) {
    await row.getByRole("checkbox").click();
    await page.keyboard.press("s");
    await expect(starStatus).toHaveCount(0);
    await expectCompletedStarMutation(page, emailAccountId, false);
  }
  await row.getByRole("checkbox").click();
  await page.keyboard.press("u");
  await expect(page.getByText("1 selected", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Unread", exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole("checkbox").click();
  await page.keyboard.press("s");
  await expect(
    row.getByText("Starred conversation", { exact: true }),
  ).toHaveCount(1);
  await expectCompletedStarMutation(page, emailAccountId, true);
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  });
  await expect(row).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "starred-and-unread-dots");
  await row.getByRole("checkbox").click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Type a command or search...").fill("star");
  await page.getByRole("option", { name: /^Unstar/ }).click();
  await expect(
    row.getByText("Starred conversation", { exact: true }),
  ).toHaveCount(0);
  await expectCompletedStarMutation(page, emailAccountId, false);
  await row.click();
  const readerStarStatus = page
    .getByTestId("thread-reader")
    .getByRole("img", { name: "Starred conversation", exact: true });
  await expect(readerStarStatus).toHaveCount(0);
  await page.keyboard.press("s");
  await expect(readerStarStatus).toBeVisible();
  await expectCompletedStarMutation(page, emailAccountId, true);
  await capturePlaywrightCheckpoint(page, testInfo, "starred-reader-subject");
  await page.keyboard.press("s");
  await expect(readerStarStatus).toHaveCount(0);
  await expectCompletedStarMutation(page, emailAccountId, false);

  await page.getByRole("button", { name: /^More actions/ }).click();
  const actionsMenu = page.getByRole("menu");
  await actionsMenu.getByRole("menuitem", { name: /^Star/ }).click();
  await expect(readerStarStatus).toBeVisible();
  await expectCompletedStarMutation(page, emailAccountId, true);
  await page.getByRole("button", { name: /^More actions/ }).click();
  await actionsMenu.getByRole("menuitem", { name: /^Unstar/ }).click();
  await expect(readerStarStatus).toHaveCount(0);
  await expectCompletedStarMutation(page, emailAccountId, false);
});

async function expectCompletedStarMutation(
  page: Page,
  emailAccountId: string,
  starred: boolean,
) {
  // The optimistic indicator can update before action targeting catches up.
  // Finish each mutation before exercising the next toggle entry point.
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "set_starred_state",
      }),
    )
    .toMatchObject({ status: "succeeded", payload: { starred } });
}
