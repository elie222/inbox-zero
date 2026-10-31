import { expect, type Locator, type Page } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "./account-test-helpers";
import {
  conversationWithSubject,
  expectThreadReaderBody,
  openMail,
} from "./mail-test-helpers";
import type { MailSettingsResponse } from "@/app/api/mail/settings/route";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

test("refreshes date groups after midnight when the tab resumes", async ({
  page,
}, testInfo) => {
  // The emulator dates its newest messages 24 hours before setup.
  const mailboxDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await page.clock.install({ time: mailboxDay });
  const { conversations } = await openMail(page);
  const today = conversations.getByRole("group", {
    name: "Today",
    exact: true,
  });
  await expect(today).toBeVisible();
  await expect(today.getByText("Today", { exact: true })).toHaveCount(0);
  const todaySubjects = await today
    .locator("[data-mail-thread-subject]")
    .allTextContents();
  expect(todaySubjects.length).toBeGreaterThan(0);

  const afterMidnight = await page.evaluate(() => {
    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 1, 0, 0);
    return nextDay.getTime();
  });
  // Moving the clock without running timers simulates a suspended tab.
  await page.clock.setSystemTime(afterMidnight);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  const yesterday = conversations.getByRole("group", {
    name: "Yesterday",
    exact: true,
  });
  for (const subject of todaySubjects) {
    await expect(yesterday.getByText(subject, { exact: true })).toBeVisible();
    await expect(today.getByText(subject, { exact: true })).toHaveCount(0);
  }
  await expect(yesterday.getByText("Yesterday", { exact: true })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-date-rollover");
});

test("switches between list and split reading layouts", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const emptyReader = page.getByText("Nothing selected", { exact: true });
  await expect(emptyReader).toBeHidden();

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
  await expectThreadReaderBody(
    page,
    "This conversation is visible in the seeded project label.",
  );
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

test("uses the split reading layout in All Accounts", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  const secondAccount = await createSecondEmailAccount(emailAccountId);

  try {
    await page.goto(`/${emailAccountId}/mail?accountScope=all`, {
      waitUntil: "domcontentloaded",
    });
    const conversations = page.getByRole("listbox", { name: "Conversations" });
    await expect(conversations).toBeVisible({ timeout: 60_000 });
    const layoutToggle = page.getByRole("button", {
      name: "Switch list or split view",
    });
    const emptyReader = page.getByText("Nothing selected", { exact: true });

    await layoutToggle.click();
    await expect(emptyReader).toBeVisible();

    await conversationWithSubject(page, conversations, "Project Label Message")
      .first()
      .click();
    await expectThreadReaderBody(
      page,
      "This conversation is visible in the seeded project label.",
    );
    await expect(conversations).toBeVisible();
    await capturePlaywrightCheckpoint(page, testInfo, "all-accounts-split");

    await page.keyboard.press("Escape");
    await layoutToggle.click();
    await expect(emptyReader).toBeHidden();
  } finally {
    await deleteSecondEmailAccount(secondAccount.accountId);
  }
});

test("resizes the split-layout email list and remembers the width", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const layoutToggle = page.getByRole("button", {
    name: "Switch list or split view",
  });
  const emptyReader = page.getByText("Nothing selected", { exact: true });
  await layoutToggle.click();
  await expect(emptyReader).toBeVisible();

  const handle = page.getByRole("separator", { name: "Resize email list" });
  const defaultWidth = await boxWidth(conversations);
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Resize handle is not rendered");
  const handleX = handleBox.x + handleBox.width / 2;
  const handleY = handleBox.y + handleBox.height / 2;

  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX + 120, handleY, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => await boxWidth(conversations))
    .toBeGreaterThan(defaultWidth + 100);
  const draggedWidth = await boxWidth(conversations);
  await capturePlaywrightCheckpoint(page, testInfo, "mail-resized-list");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(emptyReader).toBeVisible();
  await expect
    .poll(async () => await boxWidth(conversations))
    .toBeCloseTo(draggedWidth, -1);

  await handle.dblclick();
  await expect
    .poll(async () => await boxWidth(conversations))
    .toBeCloseTo(defaultWidth, -1);

  // The layout preference outlives the test, so put the wide list back.
  await layoutToggle.click();
  await page.keyboard.press("Escape");
  await expect(emptyReader).toBeHidden();
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

async function boxWidth(locator: Locator) {
  const box = await locator.boundingBox();
  return box?.width ?? 0;
}
