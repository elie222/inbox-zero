import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { getEmailAccountId } from "../account-test-helpers";
import {
  CHANNEL_ID,
  CHANNEL_RULE_NAME,
  cleanupSeededChannel,
  getChannelState,
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
  await expect(page.getByText("Add a webhook", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
});

test("manages a webhook secret and rejects HTTP on reconnect", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await markAssistantOnboardingViewed(page);
  await page.goto(`/${emailAccountId}/channels`);
  await page
    .getByLabel("Webhook URL", { exact: true })
    .fill("https://example.com/digest");
  await page
    .getByLabel("Secret (optional)", { exact: true })
    .fill("playwright-webhook-secret");
  await page.getByRole("button", { name: "Add webhook", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Remove saved secret" }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("Leave blank to keep current secret"),
  ).toHaveValue("");

  const readWebhook = async () => {
    const response = await page.request.get("/api/user/messaging-channels", {
      headers: { "X-Email-Account-ID": emailAccountId },
    });
    expect(response.ok()).toBe(true);
    const { channels } = await response.json();
    return channels.find(
      (channel: { provider: string }) => channel.provider === "WEBHOOK",
    );
  };
  const created = await readWebhook();
  expect(created.hasWebhookSecret).toBe(true);
  expect(created).not.toHaveProperty("webhookSecret");

  await page
    .getByLabel("Webhook URL", { exact: true })
    .fill("https://example.com/updated-digest");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(readWebhook).toMatchObject({
    webhookUrl: "https://example.com/updated-digest",
    hasWebhookSecret: true,
  });
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "webhook-secret-configured",
  );

  await page.getByRole("checkbox", { name: "Remove saved secret" }).check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(readWebhook).toMatchObject({ hasWebhookSecret: false });
  await expect(
    page.getByRole("checkbox", { name: "Remove saved secret" }),
  ).not.toBeVisible();

  const webhookSection = page
    .getByRole("heading", { name: "Webhook", exact: true })
    .locator("..");
  await webhookSection.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole("menuitem", { name: "Remove webhook" }).click();
  await expect(
    page.getByRole("button", { name: "Add webhook", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Webhook URL", { exact: true })
    .fill("http://example.com/digest");
  await page.getByRole("button", { name: "Add webhook", exact: true }).click();
  await expect(
    page.getByText("Digest webhooks require HTTPS to protect email contents", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await readWebhook()).toMatchObject({
    id: created.id,
    isConnected: false,
  });
  await page
    .getByLabel("Webhook URL", { exact: true })
    .fill("https://example.com/digest");
  await page.getByRole("button", { name: "Add webhook", exact: true }).click();
  await expect.poll(readWebhook).toMatchObject({
    id: created.id,
    isConnected: true,
    hasWebhookSecret: false,
  });
  await capturePlaywrightCheckpoint(page, testInfo, "webhook-reconnected");
});
