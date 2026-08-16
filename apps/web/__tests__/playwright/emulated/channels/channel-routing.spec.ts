import { expect, test } from "@playwright/test";
import {
  CHANNEL_ID,
  CHANNEL_RULE_NAME,
  cleanupSeededChannel,
  getChannelState,
  getEmailAccountId,
  markAssistantOnboardingViewed,
  seedChannel,
} from "./channels-test-helpers";

test.afterEach(async () => {
  await cleanupSeededChannel();
});

test("persists rule delivery, feature routing, and channel disconnection", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  await seedChannel(emailAccountId);
  await markAssistantOnboardingViewed(page);

  const channelsResponse = await page.request.get(
    "/api/user/messaging-channels",
    { headers: { "X-Email-Account-ID": emailAccountId } },
  );
  expect(channelsResponse.ok()).toBeTruthy();
  const channelsData = (await channelsResponse.json()) as {
    channels: Array<{ id: string }>;
  };
  expect(channelsData.channels).toContainEqual(
    expect.objectContaining({ id: CHANNEL_ID }),
  );

  await page.goto(`/${emailAccountId}/channels`);
  await expect(page.getByRole("heading", { name: "Channels" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Telegram" })).toBeVisible({
    timeout: 60_000,
  });

  const telegramSection = page
    .getByRole("heading", { name: "Telegram" })
    .locator("..");
  await expect(
    telegramSection.getByText("Connected", { exact: true }),
  ).toBeVisible({ timeout: 60_000 });

  const ruleItem = page.locator('[data-slot="item"]', {
    hasText: CHANNEL_RULE_NAME,
  });
  await ruleItem.getByRole("switch").click();
  await expect(page.getByText("Settings saved", { exact: true })).toBeVisible();
  await expect
    .poll(() => getChannelState())
    .toMatchObject({
      actionTypes: ["NOTIFY_MESSAGING_CHANNEL"],
    });

  const meetingBriefsItem = page.locator('[data-slot="item"]', {
    hasText: "Meeting briefs",
  });
  await meetingBriefsItem.getByRole("switch").click();
  await expect
    .poll(() => getChannelState())
    .toMatchObject({
      routePurposes: ["MEETING_BRIEFS", "RULE_NOTIFICATIONS"],
    });

  await telegramSection.getByRole("button").first().click();
  await page.getByRole("menuitem", { name: "Disconnect Telegram" }).click();
  await expect(
    page.getByText("Telegram disconnected", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => getChannelState(), { timeout: 60_000 })
    .toEqual({
      actionTypes: ["NOTIFY_MESSAGING_CHANNEL"],
      isConnected: false,
      routePurposes: [],
    });
  await page.reload();
  await expect(
    page.getByText("No channels available.", { exact: true }),
  ).toBeVisible({ timeout: 60_000 });
});
