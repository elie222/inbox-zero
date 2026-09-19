import { expect } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";
import { isMicrosoftPlaywright } from "../mail-provider";
import { test } from "../playwright-test";

test.skip(
  isMicrosoftPlaywright(),
  "Calendar MIME invites are seeded in the Google emulator.",
);

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

test("shows inline calendar responses with the current RSVP", async ({
  page,
}, testInfo) => {
  await page.route("**/api/messages/calendar-invitation?**", (route) =>
    route.fulfill({
      json: {
        invitation: {
          title: "Project planning",
          organizer: "organizer@example.com",
          recurring: false,
          response: "accepted",
          calendarSynced: true,
        },
      },
    }),
  );
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_calendar`);
  const invitationHeader = page
    .locator('li[data-thread-message-id="msg_playwright_calendar"]')
    .locator('[role="button"][aria-expanded]');
  await expect(invitationHeader).toBeVisible({ timeout: 60_000 });
  if ((await invitationHeader.getAttribute("aria-expanded")) === "false") {
    await invitationHeader.click();
  }
  const card = page.getByLabel("Calendar invitation", { exact: true });
  await expect(card).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Yes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    card.getByRole("button", { name: "No", exact: true }),
  ).toBeEnabled();
  await expect(
    card.getByRole("button", { name: "Maybe", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("calendar-invitation-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("calendar-invitation-mobile.png"),
    fullPage: true,
  });
});
