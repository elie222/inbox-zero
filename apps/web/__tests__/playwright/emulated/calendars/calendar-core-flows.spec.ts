import { expect, test } from "@playwright/test";
import {
  openCalendars,
  PLAYWRIGHT_TEST_EMAIL,
  resetCalendarTestState,
  setupCalendarTestState,
} from "./calendar-test-helpers";

test.beforeEach(async () => {
  await setupCalendarTestState();
});

test.afterEach(async () => {
  await resetCalendarTestState();
});

test("changes which Google calendar is used for availability", async ({
  page,
}) => {
  await openCalendars(page);

  const calendarSummary = page.getByRole("button", {
    name: "1 of 1 calendars selected for availability",
  });
  await expect(calendarSummary).toBeVisible({ timeout: 60_000 });
  await calendarSummary.click();

  const primaryCalendar = calendarSummary
    .locator("..")
    .getByText(PLAYWRIGHT_TEST_EMAIL, { exact: true });
  await expect(primaryCalendar).toBeVisible();
  const calendarCard = primaryCalendar.locator(
    "xpath=ancestor::div[contains(@class, 'group/card')][1]",
  );
  const availabilitySwitch = calendarCard.getByRole("switch");
  await expect(availabilitySwitch).toBeChecked();
  const toggleResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/calendars"),
  );
  await availabilitySwitch.click();
  expect((await toggleResponse).ok()).toBeTruthy();

  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "0 of 1 calendars selected for availability",
    }),
  ).toBeVisible();
});

test("persists the booking link and scheduling timezone", async ({ page }) => {
  await openCalendars(page);

  const bookingLinkInput = page.getByPlaceholder("https://cal.com/your-link");
  await bookingLinkInput.fill("https://cal.com/playwright-test");
  await bookingLinkInput
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Save" })
    .click();
  await expect(
    page.getByText("Booking link updated!", { exact: true }),
  ).toBeVisible();

  const timezoneSelect = page.locator('select[name="timezone"]');
  await timezoneSelect.selectOption("Europe/Paris");
  await timezoneSelect
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Save" })
    .click();
  await expect(
    page.getByText("Timezone updated!", { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(bookingLinkInput).toHaveValue("https://cal.com/playwright-test");
  await expect(timezoneSelect).toHaveValue("Europe/Paris");
});
