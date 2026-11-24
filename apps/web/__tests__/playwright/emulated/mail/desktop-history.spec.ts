import { expect, type Locator, type Page } from "@playwright/test";
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
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.mouse.move(640, 400);
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
  const sidebarToggle = page.getByRole("button", { name: "Toggle Sidebar" });
  const search = page.getByRole("search");
  await sidebarToggle.click();
  await expect(back).toBeVisible();
  await expectSearchAfterControl(search, forward);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "desktop-history-collapsed-sidebar",
  );

  // Desktop 0.1.30 positions the sidebar toggle even if the HTML flag is gone.
  await page.addStyleTag({
    content: `
      :root { --desktop-traffic-lights-width: 78px; --desktop-traffic-lights-height: 52px; }
      [data-desktop-mac-titlebar-toggle] { position: fixed; top: 12px; left: 78px; }
    `,
  });
  await page.evaluate(() => delete document.documentElement.dataset.macDesktop);
  await expectSearchAfterControl(search, sidebarToggle);
  await capturePlaywrightCheckpoint(page, testInfo, "desktop-0.1.30-sidebar");

  await page.setViewportSize({ width: 900, height: 720 });
  const navigation = page.getByRole("button", { name: "Open navigation" });
  await expect(navigation).toBeVisible();
  await expect
    .poll(async () => (await navigation.boundingBox())?.x ?? 0)
    .toBeGreaterThanOrEqual(78);
  await capturePlaywrightCheckpoint(page, testInfo, "desktop-history-narrow");
});

async function expectSearchAfterControl(search: Locator, control: Locator) {
  await expect
    .poll(async () => {
      const [searchBox, controlBox] = await Promise.all([
        search.boundingBox(),
        control.boundingBox(),
      ]);
      return searchBox && controlBox
        ? searchBox.x - (controlBox.x + controlBox.width)
        : 0;
    })
    .toBeGreaterThan(0);
}

async function waitForOpenThreadId(page: Page) {
  await expect(page).toHaveURL(/thread-id=/);
  const threadId = new URL(page.url()).searchParams.get("thread-id");
  if (!threadId) throw new Error("Expected an open thread");
  return threadId;
}

function threadUrl(threadId: string) {
  return new RegExp(`thread-id=${encodeURIComponent(threadId)}(&|$)`);
}
