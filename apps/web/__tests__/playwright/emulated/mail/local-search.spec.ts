import type { ThreadListItem } from "@/utils/threads/load";
import { expect, type Page } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  conversationWithSubject,
  openMail,
  openMailboxFromSidebar,
  waitForInitialMailboxSync,
} from "./mail-test-helpers";

test("clears an uncommitted live search with the button and sidebar navigation", async ({
  page,
}) => {
  await openMail(page);
  const input = page.getByPlaceholder("Search mail");
  await input.fill("uncommitted search");
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(input).toHaveValue("");
  await input.fill("uncommitted search");
  await openMailboxFromSidebar(page, "Sent");
  await expect(page).toHaveURL(/type=sent/);
  await expect(input).toHaveValue("");
  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
  await expect(page).toHaveURL(/type=inbox/);
  await expect(input).toHaveValue("");
});

for (const scope of ["single", "all"] as const) {
  test(`${scope}: shows local matches while typing before provider completion`, async ({
    page,
    context,
  }, testInfo) => {
    await page.route("**/api/mobile/mailbox-sync", (route) => route.abort());
    const { emailAccountId, conversations } = await openMail(page);
    if (scope === "all")
      await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    await expect(conversations).toBeVisible();
    const cachedThread = await seedSearchCache(
      page,
      emailAccountId,
      scope === "single" ? 5001 : 0,
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/threads**", async (route) => {
      if (!new URL(route.request().url()).searchParams.get("q"))
        return route.continue();
      await gate;
      await route.fulfill({
        json: {
          threads: [
            {
              ...cachedThread,
              id: "provider-only-thread",
              messageIds: ["provider-only-message"],
              messages: [
                {
                  ...cachedThread.messages[0],
                  id: "provider-only-message",
                  threadId: "provider-only-thread",
                  subject: "Provider-only search result",
                  headers: {
                    ...cachedThread.messages[0].headers,
                    subject: "Provider-only search result",
                  },
                  internalDate: String(Date.now() + 1000),
                },
              ],
            },
            cachedThread,
          ].map((thread) =>
            scope === "all"
              ? {
                  ...thread,
                  account: {
                    id: emailAccountId,
                    email: "user@example.com",
                    name: null,
                    image: null,
                  },
                }
              : thread,
          ),
          nextPageToken: null,
          labelsByAccount: {},
          failedAccountIds: [],
        },
      });
    });
    const input = page.getByPlaceholder("Search mail");
    const startedAt = Date.now();
    await input.fill("needle");
    const match = conversationWithSubject(
      page,
      conversations,
      "Cached body search result",
    );
    await expect(match).toBeVisible();
    await expect(input).toBeFocused();
    await expect(
      page.getByText(
        "Searching your full mailbox… Cached results may be incomplete.",
        { exact: true },
      ),
    ).toBeVisible();
    await testInfo.attach("local-search-latency", {
      body: JSON.stringify({ firstResultMs: Date.now() - startedAt }),
      contentType: "application/json",
    });
    await capturePlaywrightCheckpoint(page, testInfo, `local-search-${scope}`);
    release();
    await expect(
      conversationWithSubject(
        page,
        conversations,
        "Provider-only search result",
      ),
    ).toBeVisible();
    await expect(match).toHaveCount(1);
    await expect(match).toHaveAttribute("tabindex", "0");
    await expect(
      page.getByText(
        "Searching your full mailbox… Cached results may be incomplete.",
        { exact: true },
      ),
    ).toHaveCount(0);
    await context.setOffline(true);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      `provider-results-offline-${scope}`,
    );
    await expect(
      page.getByText(
        "Offline — searching cached mail only. Results may be incomplete.",
        { exact: true },
      ),
    ).toHaveCount(0);
    await context.setOffline(false);
  });
}

test("searches cached bodies offline and distinguishes unsupported and empty searches", async ({
  page,
  context,
}, testInfo) => {
  await page.route("**/api/mobile/mailbox-sync", (route) => route.abort());
  const { emailAccountId, conversations } = await openMail(page);
  await seedSearchCache(page, emailAccountId);
  await page.route("**/api/threads?**", (route) =>
    new URL(route.request().url()).searchParams.get("q")
      ? route.abort()
      : route.continue(),
  );
  // Warm the worker before disconnecting; results must not require another script fetch.
  await page.getByPlaceholder("Search mail").fill("needle");
  await expect(
    conversationWithSubject(page, conversations, "Cached body search result"),
  ).toBeVisible();
  await context.setOffline(true);
  const input = page.getByPlaceholder("Search mail");
  await input.fill("subject:Cached");
  await expect(
    conversationWithSubject(page, conversations, "Cached body search result"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Offline — searching cached mail only. Results may be incomplete.",
      { exact: true },
    ),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "local-search-offline");
  await input.fill("no-such-cached-message");
  await expect(
    page.getByText(
      "No matches in cached mail. Older mail and uncached bodies may still match.",
      { exact: true },
    ),
  ).toBeVisible();
  await input.fill("has:attachment");
  await expect(
    page.getByText("Connect to search this query with your email provider.", {
      exact: true,
    }),
  ).toBeVisible();
  await context.setOffline(false);
});

test("ignores delayed responses after the search changes", async ({ page }) => {
  const { emailAccountId, conversations } = await openMail(page);
  // This is the one cache-seeding test that leaves background sync enabled, so
  // it has to let the reset page land before seeding rather than race it.
  await waitForInitialMailboxSync(page, emailAccountId);
  const cachedThread = await seedSearchCache(page, emailAccountId);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let releaseCurrent!: () => void;
  const currentGate = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  let firstRequested = false;
  let firstResponded = false;
  await page.route("**/api/threads?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (!query) return route.continue();
    if (query === "needle") {
      firstRequested = true;
      await gate;
      await route.fulfill({
        json: { threads: [cachedThread], nextPageToken: null },
      });
      firstResponded = true;
      return;
    }
    await currentGate;
    await route.fulfill({ json: { threads: [], nextPageToken: null } });
  });
  const input = page.getByPlaceholder("Search mail");
  await input.fill("needle");
  await expect(
    conversationWithSubject(page, conversations, "Cached body search result"),
  ).toBeVisible();
  await expect.poll(() => firstRequested).toBe(true);
  await input.fill("no-such-cached-message");
  const cachedEmpty = page.getByText(
    "No matches in cached mail. Older mail and uncached bodies may still match.",
    { exact: true },
  );
  await expect(cachedEmpty).toBeVisible();
  release();
  await expect.poll(() => firstResponded).toBe(true);
  await expect(cachedEmpty).toBeVisible();
  releaseCurrent();
  await expect(page.getByText("No emails in this view")).toBeVisible();
  await expect(conversations.getByRole("option")).toHaveCount(0);
  await expect(input).toHaveValue("no-such-cached-message");
});

async function seedSearchCache(
  page: Page,
  emailAccountId: string,
  messageCount = 0,
) {
  return page.evaluate(
    async ({ accountId, messageCount }) =>
      new Promise<ThreadListItem>((resolve, reject) => {
        const request = indexedDB.open("inbox-zero-email-cache");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction(
            ["threadDetails", "mailboxMessages"],
            "readwrite",
          );
          const now = Date.now();
          const message = {
            id: "cached-search-message",
            threadId: "cached-search-thread",
            subject: "Cached body search result",
            snippet: "Preview without the search term",
            textPlain: "A needle in the full cached body",
            date: new Date(now).toISOString(),
            internalDate: String(now),
            headers: {
              from: "sender@example.com",
              to: "recipient@example.com",
              subject: "Cached body search result",
              date: "",
            },
            labelIds: ["INBOX"],
            historyId: "1",
            inline: [],
          };
          tx.objectStore("threadDetails").put({
            emailAccountId: accountId,
            threadId: message.threadId,
            variant: "drafts:1|replies:0",
            data: { thread: { id: message.threadId, messages: [message] } },
            fetchedAt: now,
            lastAccessedAt: now,
            byteSize: 1000,
          });
          for (let index = 0; index < messageCount; index++) {
            const data = {
              ...message,
              id: `background-${index}`,
              threadId: `background-${index}`,
              subject: "Background cached mail",
              snippet: "Background preview",
              textPlain: undefined,
              internalDate: String(now - index),
            };
            tx.objectStore("mailboxMessages").put({
              emailAccountId: accountId,
              messageId: data.id,
              threadId: data.threadId,
              data,
              receivedAt: now - index,
              lastAccessedAt: now,
            });
          }
          tx.oncomplete = () => {
            database.close();
            resolve({
              id: message.threadId,
              messages: [message],
              messageIds: [message.id],
              snippet: message.snippet,
              participantMessages: undefined,
              plan: undefined,
              plans: [],
            });
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { accountId: emailAccountId, messageCount },
  );
}
