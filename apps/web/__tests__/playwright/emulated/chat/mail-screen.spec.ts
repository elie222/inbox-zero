import { expect, type Locator, type Page } from "@playwright/test";
import type {
  LlmEmulatorReply,
  LlmEmulatorRequest,
} from "@/__tests__/emulators/llm";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail } from "../mail/mail-test-helpers";

const NEWSLETTER_SUBJECTS = [
  "Promotion Category Message",
  "Cleanup Block Candidate",
  "Cleanup Category Archive Candidate",
];
const NEWSLETTER_SENDERS = [
  "Offers Example",
  "Cleanup Weekly",
  "Cleanup Newsletter",
];

test.beforeEach(async () => {
  await llmEmulator("/__emulator/reset", { method: "POST" });
});

test("the assistant knows the mail screen and selects emails on it", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const newsletterThreadIds = await Promise.all(
    NEWSLETTER_SUBJECTS.map((subject) => readThreadId(conversations, subject)),
  );

  await page.getByRole("button", { name: "Toggle the assistant" }).click();
  const chatInput = page.getByTestId("chat-input");
  await expect(chatInput).toBeVisible();

  await conversations
    .getByRole("checkbox", { name: "Select conversation with Alice Example" })
    .click();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();

  await scriptReply({
    match: "what did i select",
    text: "You selected the email from Alice Example.",
  });
  await sendChatMessage(page, "What did I select?");
  await expect(
    page.getByText("You selected the email from Alice Example."),
  ).toBeVisible({ timeout: 60_000 });
  const screenNote = await readMailScreenNote("What did I select?");
  expect(screenNote).toContain("Selected: 1 thread");
  expect(screenNote).toContain("Viewing: inbox split");
  await capturePlaywrightCheckpoint(page, testInfo, "chat-mail-screen-context");

  await scriptReply({
    match: "newsletters i should archive",
    toolCall: {
      name: "controlMailScreen",
      arguments: { action: "select_threads", threadIds: newsletterThreadIds },
    },
  });
  await scriptReply({
    match: "shownOnScreen",
    text: "I selected 3 newsletters. Review them and archive when you're ready.",
  });
  await sendChatMessage(page, "Select the newsletters I should archive");

  await expect(page.getByText("3 selected", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  for (const sender of NEWSLETTER_SENDERS) {
    await expect(
      conversations.getByRole("checkbox", {
        name: `Select conversation with ${sender}`,
      }),
    ).toBeChecked();
  }
  await expect(page.getByText("Selected 3 emails")).toBeVisible();
  await expect(page.getByText("I selected 3 newsletters.")).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "chat-selects-emails");
});

async function readThreadId(conversations: Locator, subject: string) {
  const row = conversations
    .locator("[data-mail-thread-key]")
    .filter({ hasText: subject });
  await expect(row).toHaveCount(1, { timeout: 60_000 });
  const threadId = await row.getAttribute("data-mail-thread-key");
  if (!threadId) throw new Error(`No thread id for "${subject}"`);
  return threadId;
}

async function sendChatMessage(page: Page, text: string) {
  const chatInput = page.getByTestId("chat-input");
  await chatInput.fill(text);
  // A reply can show before its run ends, and the input ignores Enter until
  // then. Once sent the input is empty, so a repeat Enter sends nothing.
  await expect(async () => {
    await chatInput.press("Enter");
    await expect(chatInput).toHaveValue("", { timeout: 1000 });
  }).toPass({ timeout: 60_000 });
}

async function readMailScreenNote(userText: string) {
  const requests = (await (
    await llmEmulator("/__emulator/requests")
  ).json()) as LlmEmulatorRequest[];
  const request = requests.find((candidate) =>
    candidate.messages.some(
      (message) =>
        message.role === "user" &&
        message.content.includes(userText) &&
        message.content.includes("<mail_screen>"),
    ),
  );
  return request?.messages.find((message) =>
    message.content.includes("<mail_screen>"),
  )?.content;
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
