import { expect, type Page } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

test("returns to previously opened emails with the desktop back and forward buttons", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });
    Object.assign(window, { inboxZeroDesktop: { startAuth: async () => {} } });
  });
  const { conversations } = await openMail(page);
  await page.evaluate(() => {
    document.documentElement.dataset.macDesktop = "";
  });

  const back = page.getByRole("button", { name: "Go back", exact: true });
  const forward = page.getByRole("button", { name: "Go forward", exact: true });
  await expect(back).toBeVisible();
  await expect(forward).toBeDisabled();

  await conversations.getByRole("option").first().click();
  const firstThreadId = await waitForOpenThreadId(page);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/thread-id=/);
  await conversations.getByRole("option").nth(1).click();
  const secondThreadId = await waitForOpenThreadId(page);
  expect(secondThreadId).not.toBe(firstThreadId);

  await back.click();
  await expect(page).not.toHaveURL(/thread-id=/);
  await back.click();
  await expect(page).toHaveURL(threadUrl(firstThreadId));
  await expect(forward).toBeEnabled();
  await back.hover();
  await expect(page.getByRole("tooltip")).toContainText("Go back");
  await capturePlaywrightCheckpoint(page, testInfo, "desktop-history-back");

  await forward.click();
  await forward.click();
  await expect(page).toHaveURL(threadUrl(secondThreadId));

  await page
    .getByRole("button", { name: "Back to inbox", exact: true })
    .click();
  await expect(page).not.toHaveURL(/thread-id=/);
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await expect(back).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "desktop-history-collapsed-sidebar",
  );
});

async function waitForOpenThreadId(page: Page) {
  await expect(page).toHaveURL(/thread-id=/);
  const threadId = new URL(page.url()).searchParams.get("thread-id");
  if (!threadId) throw new Error("Expected an open thread");
  return threadId;
}

function threadUrl(threadId: string) {
  return new RegExp(`thread-id=${encodeURIComponent(threadId)}(&|$)`);
}
