import { expect, type Locator } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  getAutomationSettingsCard,
  markAutomationOnboardingViewed,
} from "./automation-tabs-test-helpers";

const subject = "Project receipt with a long subject and reference number";
const message = {
  id: "mobile-message",
  threadId: "mobile-thread",
  headers: {
    from: "Demo Notifications <notifications@example.com>",
    to: "demo@example.com",
    subject,
    date: "2026-01-01T09:00:00.000Z",
  },
  date: "2026-01-01T09:00:00.000Z",
  historyId: "1",
  inline: [],
  snippet: "A routine project receipt for the demo workspace.",
  labelIds: ["INBOX"],
};

test.use({ viewport: { width: 390, height: 844 }, timezoneId: "UTC" });

test("keeps Test row controls inside the phone viewport", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await markAutomationOnboardingViewed(page);
  await page.route(/\/api\/messages(?:\?|$)/, (route) =>
    route.fulfill({ json: { messages: [message] } }),
  );
  await page.goto(`/${emailAccountId}/automation?tab=test`);
  const row = page.getByRole("row").filter({ hasText: subject });
  await expect(row).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mobile-test");
  await expectNoHorizontalOverflow(row.locator("xpath=ancestor::table/.."));
  await expectInViewport(
    row.getByRole("button", { name: "Test", exact: true }),
  );
});

test("keeps History actions beside readable email content on phones", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await markAutomationOnboardingViewed(page);
  await page.route("**/api/user/executed-rules/history?**", (route) =>
    route.fulfill({
      json: {
        totalPages: 1,
        results: [
          {
            messageId: message.id,
            threadId: message.threadId,
            messageCount: 1,
            executedRules: [
              {
                id: "mobile-execution",
                createdAt: "2026-01-01T09:00:00.000Z",
                status: "APPLIED",
                automated: true,
                reason: "Routine receipt",
                rule: {
                  id: "mobile-rule",
                  name: "Project receipt notifications and updates",
                },
                actions: [],
              },
            ],
          },
        ],
      },
    }),
  );
  await page.route("**/api/messages/batch?**", (route) =>
    route.fulfill({ json: { messages: [message] } }),
  );
  await page.goto(`/${emailAccountId}/automation?tab=history`);
  const row = page.getByRole("row").filter({ hasText: subject });
  await expect(row).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mobile-history");
  await expectNoHorizontalOverflow(row.locator("xpath=ancestor::table/.."));
  await expectInViewport(row.getByRole("button", { name: "Fix", exact: true }));
});

test("aligns the signature editor and preview at phone width", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await markAutomationOnboardingViewed(page);
  await page.goto(`/${emailAccountId}/automation?tab=settings`);
  await getAutomationSettingsCard(page, "Email signature")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Email signature",
    exact: true,
  });
  const editor = dialog.locator("#signature");
  const preview = dialog.locator('iframe[title="Signature Preview"]');
  await editor.fill("<p>Demo Support Team</p>");
  await capturePlaywrightCheckpoint(page, testInfo, "mobile-signature");
  const editorBox = await editor.boundingBox();
  const previewBox = await preview.boundingBox();
  expect(editorBox!.width).toBeGreaterThan(300);
  expect(previewBox!.y).toBeGreaterThanOrEqual(
    editorBox!.y + editorBox!.height,
  );
  await expectNoHorizontalOverflow(dialog);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
});

test("keeps learned patterns closable and the add form usable on phones", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await markAutomationOnboardingViewed(page);
  await page.route("**/api/user/group", (route) =>
    route.fulfill({
      json: {
        groups: [
          {
            id: "mobile-patterns",
            name: "Demo receipts",
            rule: { id: "mobile-rule", name: "Project receipts" },
            _count: { items: 30 },
          },
        ],
      },
    }),
  );
  await page.route("**/api/user/group/mobile-patterns/items", (route) =>
    route.fulfill({
      json: {
        group: {
          name: "Demo receipts",
          items: Array.from({ length: 30 }, (_, index) => ({
            id: `mobile-pattern-${index}`,
            type: "FROM",
            value: `receipt-${index}@demo-project.example.com`,
            exclude: false,
            createdAt: "2026-01-01T09:00:00.000Z",
            updatedAt: "2026-01-01T09:00:00.000Z",
          })),
        },
      },
    }),
  );
  await page.goto(`/${emailAccountId}/automation?tab=settings`);
  await getAutomationSettingsCard(page, "Learned patterns")
    .getByRole("button", { name: "View", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Learned patterns",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Add pattern", exact: true })
    .click();
  const input = dialog.getByPlaceholder("e.g. hello@company.com");
  await input.fill("receipts@example.com");
  await capturePlaywrightCheckpoint(page, testInfo, "mobile-patterns-add");
  expect((await input.boundingBox())!.width).toBeGreaterThan(180);
  await expectInViewport(
    dialog.getByRole("button", { name: "Close", exact: true }),
  );
  await expectNoHorizontalOverflow(dialog);
  await dialog.locator("div.overflow-y-auto").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expectInViewport(
    dialog.getByRole("button", { name: "Close", exact: true }),
  );
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
});

test("keeps calendar options and availability controls on phones", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await markAutomationOnboardingViewed(page);
  await page.route("**/api/user/calendars", (route) =>
    route.fulfill({
      json: {
        timezone: "UTC",
        connections: [
          {
            id: "mobile-calendar",
            provider: "google",
            email: "calendar-notifications@demo-project.example.com",
            isConnected: true,
            calendars: [
              {
                id: "mobile-primary",
                name: "Demo team calendar",
                calendarId: "primary",
                isEnabled: true,
                primary: true,
                timezone: "UTC",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.goto(`/${emailAccountId}/calendars`);
  const options = page.getByRole("button", {
    name: "Calendar options",
    exact: true,
  });
  await expect(options).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mobile-calendars");
  await expectInViewport(options);
  await options.click();
  await expect(
    page.getByRole("menuitem", { name: "Disconnect", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const availability = page
    .getByRole("heading", { name: "Availability", exact: true })
    .locator("xpath=ancestor::section");
  await availability.scrollIntoViewIfNeeded();
  await capturePlaywrightCheckpoint(page, testInfo, "mobile-availability");
  await expectNoHorizontalOverflow(availability);
});

test("keeps integration requests accessible on phones", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await page.route("**/api/user/me", async (route) => {
    const response = await route.fetch();
    const user = await response.json();
    await route.fulfill({
      response,
      json: {
        ...user,
        premium: {
          ...user.premium,
          tier: "PLUS_MONTHLY",
          stripeSubscriptionStatus: "active",
        },
      },
    });
  });
  await markAutomationOnboardingViewed(page);
  await page.goto(`/${emailAccountId}/integrations`);
  const request = page.getByRole("button", {
    name: "Request an Integration",
    exact: true,
  });
  await expect(request).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mobile-integrations");
  await expectInViewport(request);
  await request.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
});

async function expectNoHorizontalOverflow(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((element) => element.scrollWidth - element.clientWidth),
    )
    .toBeLessThanOrEqual(1);
}

async function expectInViewport(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
}
