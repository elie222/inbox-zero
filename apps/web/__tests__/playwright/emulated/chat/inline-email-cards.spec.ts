import { expect, type Locator, type Page } from "@playwright/test";
import type { LlmEmulatorReply } from "@/__tests__/emulators/llm";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail } from "../mail/mail-test-helpers";

const URGENT = [
  {
    subject: "Reply Workflow Message",
    lead: "A customer asks for a refund on a plan they started by mistake.",
    summary: "Asks for a refund on a monthly plan created by mistake.",
  },
  {
    subject: "Reader Visual Message",
    lead: "A customer wants to confirm both payments were refunded.",
    summary: "Asks you to confirm both payments were refunded.",
  },
  {
    subject: "Playwright Test Message",
    lead: "A customer was billed annually after choosing monthly.",
    summary: "Billed for an annual plan by mistake; asks for a correction.",
  },
];
const LATER = [
  {
    subject: "Keyboard Navigation Message",
    lead: "A partner asks for feedback on a draft proposal.",
    summary: "Wants comments on the proposal before Friday.",
  },
  {
    subject: "Project Label Message",
    lead: "A teammate asks whether the launch date still holds.",
    summary: "Asks if next week's launch date is still on track.",
  },
];

test.beforeEach(async () => {
  await llmEmulator("/__emulator/reset", { method: "POST" });
});

// Models often wrap cards in their own markdown numbered list and restate each
// card's summary above it. The cards must still read as one tidy list.
test("inline email cards stay readable when the reply wraps them in a numbered list", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { conversations } = await openMail(page);
  const urgent = await withThreadIds(conversations, URGENT);
  const later = await withThreadIds(conversations, LATER);

  await page.getByRole("button", { name: "Toggle the assistant" }).click();
  await expect(page.getByTestId("chat-input")).toBeVisible();

  await scriptReply({
    match: "go through the ones needing replies",
    toolCall: {
      name: "searchInbox",
      arguments: { query: "in:inbox", limit: 20 },
    },
  });
  let index = 0;
  const section = (items: typeof urgent) =>
    items
      .map((item) => {
        index += 1;
        return `${index}. ${item.lead}\n\n   <email index="${index}" threadid="${item.threadId}">${item.summary}</email>`;
      })
      .join("\n\n");
  await scriptReply({
    match: "totalReturned",
    text: [
      "I found a handful of emails that need a reply. Here they are, grouped by urgency.",
      "## Must handle now",
      section(urgent),
      "## Can wait",
      section(later),
    ].join("\n\n"),
  });

  await sendChatMessage(
    page,
    "Can you help me go through the ones needing replies?",
  );
  const firstCard = page
    .getByRole("button", { name: new RegExp(URGENT[0].summary) })
    .first();
  await expect(firstCard).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(LATER[1].summary)).toBeVisible();
  // The reply's markdown list numbers each card, so the card adds no second number.
  await expect(page.getByText("1.", { exact: true })).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "chat-email-cards-list");
});

test("freeform text with an empty card under each email", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { conversations } = await openMail(page);
  const urgent = await withThreadIds(conversations, URGENT);
  const later = await withThreadIds(conversations, LATER);

  await page.getByRole("button", { name: "Toggle the assistant" }).click();
  await expect(page.getByTestId("chat-input")).toBeVisible();

  await scriptReply({
    match: "go through the ones needing replies",
    toolCall: {
      name: "searchInbox",
      arguments: { query: "in:inbox", limit: 20 },
    },
  });
  let index = 0;
  const section = (items: typeof urgent) =>
    items
      .map((item) => {
        index += 1;
        return `${index}. ${item.lead}\n   <email threadid="${item.threadId}"></email>`;
      })
      .join("\n");
  await scriptReply({
    match: "totalReturned",
    text: [
      "I found a handful of emails that need a reply. Here they are, grouped by urgency.",
      "## Must handle now",
      section(urgent),
      "## Can wait",
      section(later),
    ].join("\n\n"),
  });

  await sendChatMessage(
    page,
    "Can you help me go through the ones needing replies?",
  );
  await expect(page.getByText(LATER[1].lead)).toBeVisible({
    timeout: 60_000,
  });
  const firstCard = page
    .getByRole("button", { name: new RegExp(URGENT[0].subject) })
    .first();
  await expect(firstCard).toBeVisible();
  await expect(page.getByText("Open email")).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "chat-email-freeform");

  // Beside the mail screen, a card opens its email over the list and reader,
  // leaving the list mounted underneath so the user's place survives.
  await firstCard.click();
  const overlay = page.getByRole("region", { name: "Email from chat" });
  await expect(
    overlay.getByText("Please reply to this seeded conversation."),
  ).toBeVisible({ timeout: 30_000 });
  await expect(firstCard).toHaveAttribute("aria-current", "true");
  await expect(conversations).toBeAttached();
  await expect(page.getByTestId("chat-input")).toBeVisible();
  await expect(overlay.getByText("From chat · 1 of 5")).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "chat-email-overlay");

  // Step through the chat's emails without going back to the chat panel.
  const secondCard = page
    .getByRole("button", { name: new RegExp(URGENT[1].subject) })
    .first();
  await page.keyboard.press("j");
  await expect(overlay.getByText("From chat · 2 of 5")).toBeVisible();
  await expect(secondCard).toHaveAttribute("aria-current", "true");
  await overlay
    .getByRole("button", { name: "Previous email from chat" })
    .click();
  await expect(firstCard).toHaveAttribute("aria-current", "true");

  await overlay.getByRole("button", { name: "Close email" }).click();
  await expect(overlay).toHaveCount(0);
  await expect(conversations).toBeVisible();
  await expect(firstCard).not.toHaveAttribute("aria-current", "true");
});

async function withThreadIds<T extends { subject: string }>(
  conversations: Locator,
  items: T[],
) {
  return Promise.all(
    items.map(async (item) => {
      const row = conversations
        .locator("[data-mail-thread-key]")
        .filter({ hasText: item.subject })
        .first();
      await expect(row).toBeVisible({ timeout: 60_000 });
      const threadId = await row.getAttribute("data-mail-thread-key");
      if (!threadId) throw new Error(`No thread id for "${item.subject}"`);
      return { ...item, threadId };
    }),
  );
}

async function sendChatMessage(page: Page, text: string) {
  const chatInput = page.getByTestId("chat-input");
  await chatInput.fill(text);
  await expect(async () => {
    await chatInput.press("Enter");
    await expect(chatInput).toHaveValue("", { timeout: 1000 });
  }).toPass({ timeout: 60_000 });
}

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
