import { expect } from "@playwright/test";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  conversationWithSubject,
  openMail,
  readLatestMailMutation,
} from "./mail-test-helpers";

test("sends an autosaved reply using its stable mailbox draft reference", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Draft deletion example",
  ).click();
  const editor = page.getByRole("textbox", { name: "Email message" }).first();
  await expect(editor).toBeVisible({ timeout: 60_000 });
  const saved = page.waitForResponse(async (response) => {
    const request = response.request();
    return Boolean(
      request.headers()["next-action"] &&
        request.postData()?.includes("Edited saved reply") &&
        request.postData()?.includes("draftMessageId"),
    );
  });
  await editor.fill("Edited saved reply");
  expect((await saved).ok()).toBe(true);
  await page.getByRole("button", { name: "Send", exact: true }).first().click();
  await expect
    .poll(async () => {
      const row = await readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "thr_draft_indicator",
      });
      return row;
    })
    .toMatchObject({
      status: "succeeded",
      payload: { email: { providerDraftId: expect.any(String) } },
    });
  const response = await page.request.get(
    new URL(
      "/api/threads/thr_draft_indicator?includeDrafts=true",
      page.url(),
    ).toString(),
    { headers: { [EMAIL_ACCOUNT_HEADER]: emailAccountId } },
  );
  expect(response.ok()).toBe(true);
  const { thread }: ThreadResponse = await response.json();
  expect(
    thread.messages.filter((message) => message.labelIds?.includes("DRAFT")),
  ).toHaveLength(1);
  const sent = thread.messages.filter((message) =>
    message.labelIds?.includes("SENT"),
  );
  expect(sent).toHaveLength(1);
  expect(sent[0].textHtml).toContain("Edited saved reply");
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_draft_indicator`);
  await expect(
    page.locator(`[data-thread-message-id="${sent[0].id}"]`),
  ).toBeVisible();
  await expect(
    page.getByText("Reply could not be sent", { exact: true }),
  ).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "autosaved-reply-sent");
});

test("dismisses an old failed outbox reply without removing mailbox messages", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Reply Workflow Message",
  ).click();
  await page.evaluate(async (accountId) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("inbox-zero-email-cache");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("mailMutations", "readwrite");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.objectStore("mailMutations").put({
          id: "old-failed-reply",
          batchId: "old-failed-reply",
          emailAccountId: accountId,
          threadId: "thr_playwright_reply",
          messageIds: ["msg_playwright_reply"],
          kind: "reply",
          status: "failed",
          attempts: 1,
          nextAttemptAt: 0,
          createdAt: Date.now() - 86_400_000,
          updatedAt: Date.now(),
          notificationShownAt: Date.now(),
          lastError:
            "This draft is no longer available in Gmail. Check Sent before trying again.",
          payload: {
            email: {
              to: "recipient@example.com",
              subject: "Example reply",
              messageHtml: "<p>Saved reply from an earlier attempt.</p>",
            },
          },
        });
      };
    });
  }, emailAccountId);
  await page.reload();
  const delivery = page.getByRole("region", { name: "Reply delivery status" });
  await expect(delivery.getByText(/^Unsent reply/)).toBeVisible();
  await expect(
    delivery.getByRole("link", { name: "Check Sent" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "failed-reply-recovery");
  await delivery.getByRole("button", { name: "Dismiss failed reply" }).click();
  await expect(
    page.locator('[data-thread-message-id="outbox:old-failed-reply"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-thread-message-id="msg_playwright_reply"]'),
  ).toBeVisible();
  await page.reload();
  await expect(delivery.getByText(/^Unsent reply/)).toHaveCount(0);
  await expect(
    page.locator('[data-thread-message-id="msg_playwright_reply"]'),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "failed-reply-dismissed");
});
