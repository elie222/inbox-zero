import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import {
  cleanUpMeetingBotFixture,
  type MeetingBotFixture,
  openMeetings,
  prepareMeetingBotFixture,
} from "./meeting-bot-test-helpers";

let fixture: MeetingBotFixture | undefined;

test.beforeEach(async ({ page }) => {
  fixture = undefined;
  fixture = await prepareMeetingBotFixture(page);
});

test.afterEach(async () => {
  if (fixture) await cleanUpMeetingBotFixture(fixture);
});

test("enables the notetaker and persists meeting choices, notes, and settings", async ({
  page,
}) => {
  if (!fixture) throw new Error("The Meeting Bot fixture was not prepared");
  await openMeetings(page, fixture);

  await expect(
    page.getByRole("heading", { name: "Never write meeting notes again" }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(
    page.getByRole("heading", { name: "Which meetings should we join?" }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Which meetings to join" })
    .getByText("Only the ones I turn on myself", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start recording my meetings" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Meetings", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Up next" })).toBeVisible();

  const upcomingToggle = page.getByRole("switch", {
    name: "Record Product planning with notetaker",
  });
  await expect(upcomingToggle).toBeVisible({ timeout: 60_000 });
  await expect(upcomingToggle).not.toBeChecked();
  await upcomingToggle.click();
  await expect(upcomingToggle).toBeChecked();

  await page.getByRole("button", { name: "Recorded product review" }).click();
  const meetingDialog = page.getByRole("dialog", {
    name: "Recorded product review",
  });
  await expect(meetingDialog).toContainText(
    "The team finalized the launch plan for onboarding improvements.",
  );
  await expect(meetingDialog).toContainText(
    "Release the onboarding improvements on Friday.",
  );
  await expect(meetingDialog).toContainText(
    "Prepare the customer announcement.",
  );
  await expect(meetingDialog).toContainText(
    "We will ship the onboarding improvements on Friday.",
  );
  await expect(meetingDialog).toContainText("Follow-up draft is ready");
  await meetingDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Settings" }).click();
  const settingsDialog = page.getByRole("dialog", {
    name: "Notetaker settings",
  });
  const recapToggle = settingsDialog.getByRole("switch", {
    name: "Email me the notes",
  });
  await expect(recapToggle).toBeChecked();
  await recapToggle.click();
  await expect(page.getByText("Settings saved", { exact: true })).toBeVisible();
  await settingsDialog.getByRole("button", { name: "Close" }).click();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Meetings", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("switch", {
      name: "Record Product planning with notetaker",
    }),
  ).toBeChecked({ timeout: 60_000 });

  await page.getByRole("button", { name: "Settings" }).click();
  const persistedSettingsDialog = page.getByRole("dialog", {
    name: "Notetaker settings",
  });
  await expect(
    persistedSettingsDialog.getByRole("radio", {
      name: "Only the ones I turn on myself",
    }),
  ).toBeChecked();
  await expect(
    persistedSettingsDialog.getByRole("switch", {
      name: "Email me the notes",
    }),
  ).not.toBeChecked();
});
