import { expect, type Page } from "@playwright/test";
import type { LlmEmulatorReply } from "@/__tests__/emulators/llm";
import { getEmailAccountId } from "../account-test-helpers";
import { isMicrosoftPlaywright } from "../mail-provider";
import {
  deleteProviderMessage,
  readProviderAccessToken,
} from "../mail/mail-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";

// Chat replies are scripted through the LLM emulator, so this spec covers the
// confirmation card and the mailbox result. Which tool the model picks and
// how it words the pending trash are covered by
// __tests__/eval/assistant-chat-trash-delete.

const SUBJECTS = ["Expired coupon inside", "Your expired coupon reminder"];

type SeededMessage = { id: string; threadId: string };

let seeded: SeededMessage[] = [];

test.beforeEach(async () => {
  test.skip(isMicrosoftPlaywright(), "Uses Gmail emulator message insertion");
  await llmEmulator("/__emulator/reset", { method: "POST" });
  seeded = [];
});

test.afterEach(async ({ page }) => {
  const cleanupErrors: unknown[] = [];
  for (const message of seeded) {
    await deleteProviderMessage(page, message.id).catch((error: unknown) => {
      cleanupErrors.push(error);
    });
  }
  expect(cleanupErrors).toEqual([]);
});

test("chat trashes emails only after the user confirms", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  await askChatToTrashCoupons(page);

  const confirm = page.getByRole("button", { name: "Move to trash" });
  await expect(confirm).toBeEnabled({ timeout: 90_000 });
  await expect(page.getByText("Move 2 emails to trash")).toBeVisible();
  await expect(page.getByText(SUBJECTS[0], { exact: false })).toBeVisible();

  const token = await readProviderAccessToken();
  for (const message of seeded) {
    expect(await readLabelIds(page, token, message.id)).not.toContain("TRASH");
  }
  await capturePlaywrightCheckpoint(page, testInfo, "trash-1-pending");

  await confirm.click();
  await expect(page.getByText("Trashed emails")).toBeVisible({
    timeout: 30_000,
  });
  for (const message of seeded) {
    expect(await readLabelIds(page, token, message.id)).toContain("TRASH");
  }
  await capturePlaywrightCheckpoint(page, testInfo, "trash-2-confirmed");

  // The confirmed state is saved, so a reload does not offer to trash again.
  await page.reload();
  await expect(page.getByText("Trashed emails")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: "Move to trash" })).toHaveCount(
    0,
  );
});

test("cancelling the card leaves the mailbox untouched", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  await askChatToTrashCoupons(page);
  await expect(page.getByRole("button", { name: "Move to trash" })).toBeEnabled(
    { timeout: 90_000 },
  );

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Cancelled. Nothing changed.")).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "trash-3-cancelled");
  await expect(page.getByRole("button", { name: "Move to trash" })).toHaveCount(
    0,
  );

  const token = await readProviderAccessToken();
  for (const message of seeded) {
    expect(await readLabelIds(page, token, message.id)).toContain("INBOX");
  }

  // The cancelled state is saved, so a reload does not offer to trash again.
  await page.reload();
  await expect(page.getByText("Cancelled. Nothing changed.")).toBeVisible({
    timeout: 60_000,
  });
});

async function askChatToTrashCoupons(page: Page) {
  const marker = `trashdemo${Date.now().toString(36)}`;
  for (const [index, subject] of SUBJECTS.entries()) {
    await insertInboxMessage(page, {
      from: "Coupons <offers@coupons.example>",
      subject: `${subject} ${marker}`,
      internalDate: Date.now() - index * 60_000,
    });
  }

  await scriptReply({
    match: "delete the coupon emails",
    toolCall: { name: "searchInbox", arguments: { query: marker } },
  });
  await scriptReply({
    match: "expired coupon inside",
    toolCall: {
      name: "manageInbox",
      arguments: {
        action: "trash_threads",
        threadIds: seeded.map((message) => message.threadId),
      },
    },
  });
  await scriptReply({
    match: '"actiontype":"trash_threads"',
    text: "Both coupon emails are ready to move to trash once you confirm.",
  });

  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/assistant`);
  await sendChatMessage(page, "Delete the coupon emails");
}

async function insertInboxMessage(
  page: Page,
  input: { from: string; subject: string; internalDate: number },
) {
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
        body_text: "Your coupon has expired.",
        labelIds: ["INBOX", "UNREAD"],
        internalDate: String(input.internalDate),
      },
    },
  );
  expect(response.ok(), await response.text()).toBe(true);
  const message = (await response.json()) as SeededMessage;
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
