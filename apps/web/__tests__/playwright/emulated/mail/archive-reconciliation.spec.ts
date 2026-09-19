import { expect, type Page } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  conversationWithSubject,
  insertInboxMailInConversation,
  openMail,
  readLatestMailMutation,
} from "./mail-test-helpers";

const THREAD_ID = "thr_playwright_archive";
const SUBJECT = "Archive Action Message";

test("keeps an archived conversation hidden through engine reconciliation", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(page, conversations, SUBJECT);
  await expect(conversation).toHaveCount(1);

  const cleanupErrors: unknown[] = [];
  try {
    await conversation.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(conversation).toHaveCount(0);
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "archive",
          threadId: THREAD_ID,
        }),
      )
      .toMatchObject({
        status: expect.stringMatching(/^(reconciling|succeeded)$/),
      });
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "archive-awaiting-final-page",
    );

    await expect
      .poll(
        () =>
          readLatestMailMutation(page, {
            emailAccountId,
            kind: "archive",
            threadId: THREAD_ID,
          }),
        { timeout: 60_000 },
      )
      .toMatchObject({ status: "succeeded" });
    await expect(conversation).toHaveCount(0);
    await capturePlaywrightCheckpoint(page, testInfo, "archive-reconciled");
  } finally {
    await page.request
      .post(`/api/threads/${THREAD_ID}/unarchive`, {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
    for (const error of cleanupErrors) {
      testInfo.annotations.push({
        type: "cleanup-error",
        description: String(error),
      });
    }
  }
  expect(cleanupErrors).toEqual([]);
});

test("keeps a queued archive hidden after an OPFS reload", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(page, conversations, SUBJECT);
  await expect(conversation).toHaveCount(1);

  let releaseExecute = () => {};
  const held = new Promise<void>((resolve) => {
    releaseExecute = resolve;
  });
  await page.route(
    "**/api/mail/v1/accounts/**/operations/**",
    async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      await held;
      await route.continue();
    },
  );

  const cleanupErrors: unknown[] = [];
  try {
    await conversation.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(conversation).toHaveCount(0);
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "archive",
          threadId: THREAD_ID,
        }),
      )
      .toMatchObject({
        status: "reconciling",
      });
    await page.reload({ waitUntil: "domcontentloaded" });
    const reloaded = page.getByRole("listbox", { name: "Conversations" });
    await expect(reloaded.getByRole("option").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(conversationWithSubject(page, reloaded, SUBJECT)).toHaveCount(
      0,
    );
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "archive-queued-after-opfs-reload",
    );
  } finally {
    releaseExecute();
    await page.request
      .post(`/api/threads/${THREAD_ID}/unarchive`, {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
    for (const error of cleanupErrors) {
      testInfo.annotations.push({
        type: "cleanup-error",
        description: String(error),
      });
    }
  }
  expect(cleanupErrors).toEqual([]);
});

test("drops Inbox and Unread counts when an unread conversation is archived", async ({
  page,
}, testInfo) => {
  const threadId = "thr_playwright_3";
  const subject = "Second Unread Command Message";
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(page, conversations, subject);
  await expect(conversation).toBeVisible();
  await expect.poll(() => inboxUnreadBadge(page)).toBeGreaterThan(0);
  const before = await inboxUnreadBadge(page);

  const cleanupErrors: unknown[] = [];
  try {
    await conversation.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(conversation).toHaveCount(0);
    await expect.poll(() => inboxUnreadBadge(page)).toBe(before - 1);
    await page.getByRole("button", { name: "Unread", exact: true }).click();
    await expect(conversation).toHaveCount(0);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "unread-list-after-archive-count",
    );

    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect
      .poll(
        () =>
          readLatestMailMutation(page, {
            emailAccountId,
            kind: "archive",
            threadId,
          }),
        { timeout: 60_000 },
      )
      .toMatchObject({
        status: expect.stringMatching(/^(reconciling|succeeded)$/),
      });
    const unarchive = await page.request.post(
      `/api/threads/${threadId}/unarchive`,
      { headers: { "X-Email-Account-ID": emailAccountId } },
    );
    expect(unarchive.ok()).toBe(true);
    await expect(conversation).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => inboxUnreadBadge(page)).toBe(before);
    await page.getByRole("button", { name: "Unread", exact: true }).click();
    await expect(conversation).toBeVisible();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "unread-list-after-provider-unarchive",
    );
  } finally {
    await page.request
      .post(`/api/threads/${threadId}/unarchive`, {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
    for (const error of cleanupErrors) {
      testInfo.annotations.push({
        type: "cleanup-error",
        description: String(error),
      });
    }
  }
  expect(cleanupErrors).toEqual([]);
});

test("returns an archived conversation when new mail arrives in it", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(page, conversations, SUBJECT);
  await expect(conversation).toHaveCount(1);

  const cleanupErrors: unknown[] = [];
  try {
    await conversation.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(conversation).toHaveCount(0);
    await expect
      .poll(
        () =>
          readLatestMailMutation(page, {
            emailAccountId,
            kind: "archive",
            threadId: THREAD_ID,
          }),
        { timeout: 60_000 },
      )
      .toMatchObject({ status: "succeeded" });
    await expect(conversation).toHaveCount(0);
    await insertInboxMailInConversation(page, {
      threadId: THREAD_ID,
      messageId: "msg_playwright_archive",
      subject: SUBJECT,
      from: "Erin Example <erin@example.com>",
    });
    await expect(conversation).toBeVisible({ timeout: 60_000 });
    await capturePlaywrightCheckpoint(page, testInfo, "archive-then-new-mail");
  } finally {
    await page.request
      .post(`/api/threads/${THREAD_ID}/unarchive`, {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
    for (const error of cleanupErrors) {
      testInfo.annotations.push({
        type: "cleanup-error",
        description: String(error),
      });
    }
  }
  expect(cleanupErrors).toEqual([]);
});

function inboxLink(page: Page) {
  return page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ });
}

async function inboxUnreadBadge(page: Page) {
  const name = (await inboxLink(page).innerText()).replace(/\s+/g, " ").trim();
  const match = name.match(/^Inbox(?: (\d+))?$/);
  return match?.[1] ? Number(match[1]) : 0;
}
