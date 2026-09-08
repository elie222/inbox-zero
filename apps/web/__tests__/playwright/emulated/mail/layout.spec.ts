import { expect, type Locator, type Page } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";
import type { MailSettingsResponse } from "@/app/api/mail/settings/route";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

test("refreshes date groups after midnight when the tab resumes", async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date() });
  const { conversations } = await openMail(page);
  const today = conversations.getByRole("group", {
    name: "Today",
    exact: true,
  });
  await expect(today).toBeVisible();
  await expect(today.getByText("Today", { exact: true })).toHaveCount(0);
  const todayCount = await today.getByRole("option").count();
  expect(todayCount).toBeGreaterThan(0);

  const afterMidnight = await page.evaluate(() => {
    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 1, 0, 0);
    return nextDay.getTime();
  });
  // Moving the clock without running timers simulates a suspended tab.
  await page.clock.setSystemTime(afterMidnight);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(today).toHaveCount(0);
  const yesterday = conversations.getByRole("group", {
    name: "Yesterday",
    exact: true,
  });
  await expect(yesterday.getByRole("option")).toHaveCount(todayCount);
  await expect(yesterday.getByText("Yesterday", { exact: true })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-date-rollover");
});

test("switches between list and split reading layouts", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const emptyReader = page.getByText("Nothing selected", { exact: true });
  await expect(emptyReader).toBeHidden();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-list-layout");

  await page.getByRole("button", { name: "Switch list or split view" }).click();
  await expect(emptyReader).toBeVisible();
  await expect(conversations).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-split-layout");

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
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-selected-conversation-layout",
  );

  await expect(page.getByRole("button", { name: /Focus mode/i })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Switch list or split view" }).click();
  await page.keyboard.press("Escape");
  await expect(conversations).toBeVisible();
});

test("expands and shortens the conversation preview text", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  // Only the wide list puts the snippet beside the subject, so the split
  // preference has to be off for the two preview branches to differ.
  await expect(
    page.getByText("Nothing selected", { exact: true }),
  ).toBeHidden();

  const toggle = page.getByRole("button", {
    name: "Expand or shorten preview text",
  });
  // Both preferences outlive a test, so start from short rather than assume it.
  if ((await toggle.getAttribute("aria-pressed")) === "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  }
  await expectStoredPreview(page, emailAccountId, false);

  const row = conversations.getByRole("option").first();
  const shortHeight = await rowHeight(row);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => await rowHeight(row))
    .toBeGreaterThan(shortHeight);
  await capturePlaywrightCheckpoint(page, testInfo, "mail-expanded-preview");

  // The preference is stored per account, so a reload has to keep it on.
  await expectStoredPreview(page, emailAccountId, true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => await rowHeight(row)).toBe(shortHeight);
  await expectStoredPreview(page, emailAccountId, false);
});

/**
 * Waits on the stored preference rather than the action's response, so a
 * concurrent server action can't settle the wait early and let a reload abort
 * the write that is still in flight.
 */
async function expectStoredPreview(
  page: Page,
  emailAccountId: string,
  expected: boolean,
) {
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/mail/settings", {
        headers: { [EMAIL_ACCOUNT_HEADER]: emailAccountId },
      });
      const settings = (await response.json()) as MailSettingsResponse;
      return settings.expandedPreview;
    })
    .toBe(expected);
}

async function rowHeight(row: Locator) {
  const box = await row.boundingBox();
  return box?.height ?? 0;
}
