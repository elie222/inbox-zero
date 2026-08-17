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

  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get(
            "/api/user/messaging-channels",
            { headers: { "X-Email-Account-ID": emailAccountId } },
          );
          if (!response.ok()) return false;

          const data = (await response.json()) as {
            channels: Array<{ id: string }>;
          };
          return data.channels.some((channel) => channel.id === CHANNEL_ID);
        } catch {
          return false;
        }
      },
      { timeout: 60_000 },
    )
    .toBe(true);

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
  const ruleSwitch = ruleItem.getByRole("switch");
  await expect(ruleSwitch).toBeEnabled({ timeout: 60_000 });
  await ruleSwitch.click();
  await expect(page.getByText("Settings saved", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(() => getChannelState(emailAccountId), { timeout: 60_000 })
    .toMatchObject({
      actionTypes: ["NOTIFY_MESSAGING_CHANNEL"],
    });

  const meetingBriefsItem = page.locator('[data-slot="item"]', {
    hasText: "Meeting briefs",
  });
  const meetingBriefsSwitch = meetingBriefsItem.getByRole("switch");
  await expect(meetingBriefsSwitch).toBeEnabled({ timeout: 60_000 });
  await meetingBriefsSwitch.click();
  await expect
    .poll(() => getChannelState(emailAccountId), { timeout: 60_000 })
    .toMatchObject({
      routePurposes: ["MEETING_BRIEFS", "RULE_NOTIFICATIONS"],
    });

  await telegramSection.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole("menuitem", { name: "Disconnect Telegram" }).click();
  await expect(
    page.getByText("Telegram disconnected", { exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(() => getChannelState(emailAccountId), { timeout: 60_000 })
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
