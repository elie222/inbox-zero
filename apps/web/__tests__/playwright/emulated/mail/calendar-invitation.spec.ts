import { expect } from "@playwright/test";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

test("shows inline calendar responses with the current RSVP", async ({
  page,
}, testInfo) => {
  await page.route("**/api/threads/thr_playwright_reader?**", async (route) => {
    const response = await route.fetch();
    const body: ThreadResponse = await response.json();
    const message = body.thread.messages.at(-1);
    if (!message) throw new Error("Reader fixture has no messages");
    message.calendarContent = "BEGIN:VCALENDAR";
    await route.fulfill({ response, json: body });
  });
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
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reader`);
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
