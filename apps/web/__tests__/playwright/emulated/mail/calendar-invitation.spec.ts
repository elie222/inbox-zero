import { expect } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";
import { isMicrosoftPlaywright } from "../mail-provider";
import { test } from "../playwright-test";

test.skip(
  isMicrosoftPlaywright(),
  "Calendar MIME invites are seeded in the Google emulator.",
);

// The card renders the meeting time in the viewer's timezone.
test.use({ timezoneId: "UTC" });

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
          attendee: "user@test.com",
          organizerName: "Ada Lovelace",
          recurring: false,
          response: "accepted",
          calendarSynced: true,
          start: "2026-10-01T10:00:00.000Z",
          end: "2026-10-01T10:30:00.000Z",
          allDay: false,
          location: "Meeting room 2",
          conferenceUrl: "https://meet.google.com/ttw-swve-twg",
          attendees: [
            {
              email: "organizer@example.com",
              name: "Ada Lovelace",
              response: "accepted",
              optional: false,
            },
            {
              email: "user@test.com",
              name: null,
              response: null,
              optional: false,
            },
          ],
        },
      },
    }),
  );
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_calendar`);
  await expect(
    page.locator('li[data-thread-message-id="msg_playwright_calendar"]'),
  ).toBeVisible({ timeout: 60_000 });
  const card = page.getByLabel("Calendar invitation", { exact: true });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(
    card.getByRole("button", { name: "Yes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    card.getByRole("button", { name: "No", exact: true }),
  ).toBeEnabled();
  await expect(
    card.getByRole("button", { name: "Maybe", exact: true }),
  ).toBeEnabled();
  await expect(
    card.getByText("Thursday, October 1, 2026 · 10:00 AM – 10:30 AM"),
  ).toBeVisible();
  await expect(card.getByText("Meeting room 2")).toBeVisible();
  await expect(
    card.getByRole("link", { name: "meet.google.com/ttw-swve-twg" }),
  ).toHaveAttribute("href", "https://meet.google.com/ttw-swve-twg");
  await expect(card.getByText("Ada Lovelace · Organizer · Yes")).toBeVisible();
  // The viewer's row reports the calendar's RSVP, not the NEEDS-ACTION the
  // organizer's copy of the invitation still carries.
  await expect(card.getByText("user@test.com · Yes")).toBeVisible();
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
