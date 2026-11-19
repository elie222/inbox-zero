import { expect } from "@playwright/test";
import type { LlmEmulatorReply } from "@/__tests__/emulators/llm";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";

// Replies are scripted through the LLM emulator: each step's prompt carries a
// marker from the step before, so the run makes several lookups before it
// answers, and slow steps hold the run open long enough to send a follow-up.

test.beforeEach(async () => {
  await llmEmulator("/__emulator/reset", { method: "POST" });
});

test("folds lookups into one row and queues a message sent mid-reply", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const run = Date.now().toString(36);
  const markers = [`first${run}`, `second${run}`, `third${run}`];

  await scriptReply({
    match: markers[0],
    toolCall: { name: "searchInbox", arguments: { query: markers[1] } },
  });
  await scriptReply({
    match: markers[1],
    slow: true,
    toolCall: { name: "searchInbox", arguments: { query: markers[2] } },
  });
  await scriptReply({
    match: markers[2],
    slow: true,
    text: "None of your rules cover this sender yet.",
  });
  await scriptReply({
    match: "split inbox tab",
    text: "Got it, I'll set up a split inbox tab for them too.",
  });

  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/assistant`);

  const chatInput = page.getByTestId("chat-input");
  await expect(chatInput).toBeVisible({ timeout: 60_000 });
  await chatInput.fill(`Check which rules cover ${markers[0]}`);
  await chatInput.press("Enter");

  await expect(page.getByRole("button", { name: "Stop response" })).toBeVisible(
    { timeout: 60_000 },
  );
  await chatInput.fill("I also want a split inbox tab for these");
  await chatInput.press("Enter");

  const queued = page.getByTestId("chat-queued-message");
  await expect(queued).toContainText("I also want a split inbox tab");
  await expect(queued.getByRole("button", { name: "Send now" })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "chat-queue-1-queued");

  await expect(
    page.getByText("Got it, I'll set up a split inbox tab for them too."),
  ).toBeVisible({ timeout: 60_000 });
  await expect(queued).toHaveCount(0);
  await expect(
    page.getByText("None of your rules cover this sender yet."),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: 30_000,
  });

  const activity = page.getByTestId("chat-activity-group");
  await expect(activity).toHaveText("Worked through 2 steps");
  await expect(page.getByText("Search Inbox ×2")).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "chat-queue-2-collapsed");

  await activity.click();
  await expect(page.getByText("Search Inbox ×2")).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "chat-queue-3-expanded");
});

async function scriptReply(reply: LlmEmulatorReply) {
  const response = await llmEmulator("/__emulator/replies", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(reply),
  });
  expect(response.ok).toBe(true);
}

function llmEmulator(path: string, init?: RequestInit) {
  return fetch(`${process.env.PLAYWRIGHT_LLM_BASE_URL}${path}`, init);
}
