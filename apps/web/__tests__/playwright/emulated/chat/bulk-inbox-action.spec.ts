import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import type { LlmEmulatorReply } from "@/__tests__/emulators/llm";
import { getEmailAccountId } from "../account-test-helpers";
import { isMicrosoftPlaywright } from "../mail-provider";
import {
  deleteProviderMessage,
  readProviderAccessToken,
} from "../mail/mail-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";

// Chat replies here are scripted through the LLM emulator, so this spec shows
// the confirmation card, the background job and the mailbox result. Which tool
// the model picks is covered by __tests__/eval/assistant-chat-bulk-inbox-action.

const NEWSLETTER_SENDERS = [
  "Tech Weekly <newsletter@techweekly.example>",
  "Deals Daily <deals@shop.example>",
  "The Morning Brief <brief@morning.example>",
  "Product Updates <updates@saas.example>",
];
const NEWSLETTER_COUNT = 56;
const CONVERSATIONS = [
  {
    from: "Dana Levi <dana@partner.example>",
    subject: "Contract redlines for Thursday",
  },
  {
    from: "Sam Ortiz <sam@client.example>",
    subject: "Can we move our call to 3pm?",
  },
  {
    from: "Priya Shah <priya@agency.example>",
    subject: "Draft homepage copy attached",
  },
  {
    from: "Leo Martin <leo@supplier.example>",
    subject: "Invoice question about order 4417",
  },
];
const PROMPT = "Archive all the newsletters I never read.";
const INSTRUCTION = "Newsletters, promotions and other bulk mail";

type SeededMessage = { id: string; threadId: string };

let seeded: SeededMessage[] = [];
let emailAccountId = "";

test.beforeEach(async ({ page }) => {
  test.skip(isMicrosoftPlaywright(), "Uses Gmail emulator message insertion");
  await llmEmulator("/__emulator/reset", { method: "POST" });
  emailAccountId = await getEmailAccountId(page);
  await deleteBulkJobs(emailAccountId);
  seeded = [];
});

test.afterEach(async ({ page }) => {
  const cleanupErrors: unknown[] = [];
  for (const message of seeded) {
    await deleteProviderMessage(page, message.id).catch((error: unknown) => {
      cleanupErrors.push(error);
    });
  }
  if (emailAccountId) await deleteBulkJobs(emailAccountId);
  expect(cleanupErrors).toEqual([]);
});

test("archives unread newsletters in the background and leaves conversations alone", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 1000 });

  const marker = `bulkdemo${Date.now().toString(36)}`;
  const newsletters: SeededMessage[] = [];
  for (let index = 0; index < NEWSLETTER_COUNT; index++) {
    const from = NEWSLETTER_SENDERS[index % NEWSLETTER_SENDERS.length];
    newsletters.push(
      await insertInboxMessage(page, {
        from,
        subject: `${from.split(" <")[0]} issue #${index + 1}`,
        body: `This week's highlights, deals and updates. Unsubscribe any time. ${marker}`,
        internalDate: Date.now() - index * 60_000,
      }),
    );
  }
  const conversations: SeededMessage[] = [];
  for (const [index, conversation] of CONVERSATIONS.entries()) {
    conversations.push(
      await insertInboxMessage(page, {
        ...conversation,
        body: `Hi, quick note from me before our meeting. ${marker}`,
        internalDate: Date.now() - (index + 1) * 90_000,
      }),
    );
  }

  await scriptReply({
    match: "newsletters i never read",
    toolCall: {
      name: "bulkManageInbox",
      arguments: {
        query: `in:inbox is:unread ${marker}`,
        action: "archive_threads",
        instruction: INSTRUCTION,
      },
    },
  });
  await scriptReply({
    match: "bulk_inbox_action",
    text: "I found the unread mail and will check each one, archiving only the newsletters and promotions. Nothing has changed yet: confirm in the card to start.",
  });
  await scriptReply({
    match: '"status":"completed"',
    text: "Done. I checked 60 unread emails, archived 56 newsletters and promotions, and left your 4 conversations in the inbox.",
  });
  // Slow enough to see the job running, fast enough to finish in seconds.
  await scriptReply({
    match: "decide which emails a bulk inbox action",
    object: { matchingEmailIds: newsletters.map((message) => message.id) },
    slow: true,
  });

  await page.goto(`/${emailAccountId}/assistant`);
  await sendChatMessage(page, PROMPT);

  const card = page.getByTestId("bulk-inbox-action-card");
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(card.getByText("60 threads")).toBeVisible();
  await expect(card.getByText(INSTRUCTION)).toBeVisible();
  const confirm = card.getByRole("button", { name: "Confirm" });
  await expect(confirm).toBeEnabled({ timeout: 30_000 });
  await card.scrollIntoViewIfNeeded();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "bulk-inbox-action-1-confirmation",
  );

  await confirm.click();
  await expect(card.getByText("Running", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "bulk-inbox-action-2-in-progress",
  );

  await expect(card.getByText("Completed", { exact: true })).toBeVisible({
    timeout: 120_000,
  });

  const job = await readLatestBulkJob(emailAccountId);
  expect(job).toMatchObject({
    status: "COMPLETED",
    processedCount: 60,
    matchedCount: 56,
    actedCount: 56,
    skippedCount: 4,
    failedCount: 0,
  });

  const token = await readProviderAccessToken();
  for (const message of newsletters) {
    expect(await readLabelIds(page, token, message.id)).not.toContain("INBOX");
  }
  for (const message of conversations) {
    expect(await readLabelIds(page, token, message.id)).toContain("INBOX");
  }

  await sendChatMessage(page, "How did the cleanup go?");
  await expect(page.getByText(/archived 56 newsletters/)).toBeVisible({
    timeout: 90_000,
  });
  // The scripted reply only fires when chat saw the finished job's totals.
  const requests = (await (
    await llmEmulator("/__emulator/requests")
  ).json()) as { messages: { content: string }[] }[];
  const statusContext = requests
    .flatMap((request) => request.messages.map((message) => message.content))
    .find((content) => content.includes('"status":"completed"'));
  expect(statusContext).toContain('"acted":56');
  expect(statusContext).toContain('"skipped":4');
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "bulk-inbox-action-3-final-totals",
  );
});

async function insertInboxMessage(
  page: Page,
  input: {
    from: string;
    subject: string;
    body: string;
    internalDate: number;
  },
): Promise<SeededMessage> {
  const token = await readProviderAccessToken();
  const response = await page.request.post(
    `${process.env.GOOGLE_BASE_URL}/gmail/v1/users/me/messages`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      data: {
        from: input.from,
        to: process.env.PLAYWRIGHT_TEST_EMAIL,
        subject: input.subject,
        body_text: input.body,
        labelIds: ["INBOX", "UNREAD"],
        internalDate: String(input.internalDate),
      },
    },
  );
  expect(response.ok(), await response.text()).toBe(true);
  const message = (await response.json()) as SeededMessage;
  // Tracked straight away so a failed seed still cleans up what it added.
  seeded.push(message);
  return message;
}

async function readLabelIds(page: Page, token: string, messageId: string) {
  const response = await page.request.get(
    `${process.env.GOOGLE_BASE_URL}/gmail/v1/users/me/messages/${messageId}?format=minimal`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { labelIds?: string[] }).labelIds ?? [];
}

async function readLatestBulkJob(accountId: string) {
  return withDb(async (client) => {
    const result = await client.query(
      `SELECT status, "processedCount", "matchedCount", "actedCount", "skippedCount", "failedCount"
       FROM "BulkInboxActionJob"
       WHERE "emailAccountId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      [accountId],
    );
    return result.rows[0];
  });
}

async function deleteBulkJobs(accountId: string) {
  await withDb((client) =>
    client.query(
      `DELETE FROM "BulkInboxActionJob" WHERE "emailAccountId" = $1`,
      [accountId],
    ),
  );
}

async function withDb<T>(run: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function sendChatMessage(page: Page, text: string) {
  const chatInput = page.getByTestId("chat-input");
  await expect(chatInput).toBeVisible({ timeout: 60_000 });
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
