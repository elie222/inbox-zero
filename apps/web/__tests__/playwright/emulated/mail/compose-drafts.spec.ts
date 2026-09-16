import { expect } from "@playwright/test";
import { Client } from "pg";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  conversationWithSubject,
  openMail,
  waitForComposeOutboxSend,
} from "./mail-test-helpers";

test("saves a closed new message with attachments in Drafts and discards it from the mailbox", async ({
  page,
}, testInfo) => {
  const { emailAccountId, conversations } = await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  await dialog
    .getByRole("combobox", { name: "To", exact: true })
    .fill("recipient@example.com");
  await page.keyboard.press("Enter");
  await dialog.getByPlaceholder("Subject").fill("Mailbox draft example");
  await dialog
    .getByRole("textbox", { name: "Email message" })
    .fill("A saved example message.");
  await dialog.getByTestId("compose-attachments-input").setInputFiles({
    name: "example.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Example attachment"),
  });
  await dialog.getByRole("button", { name: "Close compose" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => readComposeDraft(emailAccountId))
    .toMatchObject({
      closed: false,
      savingAt: null,
      draftId: expect.any(String),
      attachmentsHash: expect.any(String),
    });
  await page.getByRole("link", { name: /^Drafts/ }).click();
  const draft = conversationWithSubject(
    page,
    conversations,
    "Mailbox draft example",
  );
  await expect(draft).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "new-message-in-mailbox-drafts",
  );
  await draft.click();
  await expect(page).toHaveURL(/thread-id=/);
  const threadId = new URL(page.url()).searchParams.get("thread-id");
  const detailUrl = new URL(
    `/api/threads/${threadId}?includeDrafts=true`,
    page.url(),
  );
  const mailboxResponse = await page.request.get(detailUrl.toString(), {
    headers: { [EMAIL_ACCOUNT_HEADER]: emailAccountId },
  });
  expect(mailboxResponse.ok()).toBe(true);
  const mailboxDraft: ThreadResponse = await mailboxResponse.json();
  expect(
    mailboxDraft.thread.messages.some((message) =>
      message.attachments?.some(
        (attachment) => attachment.filename === "example.txt",
      ),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Back to inbox" }).click();
  await page.getByRole("button", { name: /^Compose/ }).click();
  await expect(
    dialog.getByRole("textbox", { name: "Email message" }),
  ).toContainText("A saved example message.");
  await expect(dialog.getByRole("list", { name: "Attachments" })).toContainText(
    "example.txt",
  );
  await dialog.getByRole("button", { name: "Discard draft" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => readComposeDraft(emailAccountId))
    .toMatchObject({ closed: true });
  await page.reload();
  await expect(conversations).toBeVisible();
  await expect(
    conversationWithSubject(page, conversations, "Mailbox draft example"),
  ).toHaveCount(0);
});

test("removes the mailbox draft after sending a new message", async ({
  page,
}) => {
  const { emailAccountId } = await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  await dialog
    .getByRole("combobox", { name: "To", exact: true })
    .fill("recipient@example.com");
  await page.keyboard.press("Enter");
  await dialog.getByPlaceholder("Subject").fill("Send saved example");
  await dialog
    .getByRole("textbox", { name: "Email message" })
    .fill("An example to send.");
  await expect
    .poll(() => readComposeDraft(emailAccountId), { timeout: 15_000 })
    .toMatchObject({
      closed: false,
      savingAt: null,
      draftId: expect.any(String),
      attachmentsHash: expect.any(String),
    });
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await waitForComposeOutboxSend(page, emailAccountId);
  await expect
    .poll(() => readComposeDraft(emailAccountId))
    .toMatchObject({ closed: true });
});

async function readComposeDraft(emailAccountId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      'SELECT "draftId", closed, "savingAt", "attachmentsHash" FROM "ComposeDraft" WHERE "emailAccountId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
      [emailAccountId],
    );
    return result.rows[0];
  } finally {
    await client.end();
  }
}
