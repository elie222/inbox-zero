import { expect, type Locator, type Page } from "@playwright/test";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import type { MailSettingsResponse } from "@/app/api/mail/settings/route";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { admissionRejectionCopy } from "@/utils/mail-engine/admission-notice";
import {
  conversationWithSubject,
  openMail,
  openMailboxFromSidebar,
  readLatestMailMutation,
} from "./mail-test-helpers";

const commandModifier = process.platform === "darwin" ? "Meta" : "Control";

test("archives a selected conversation and restores it with undo", async ({
  page,
}) => {
  const { conversations, emailAccountId } = await openMail(page);
  const archiveConversation = conversationWithSubject(
    page,
    conversations,
    "Archive Action Message",
  );

  await archiveConversation
    .getByRole("checkbox", { name: "Select conversation with Erin Example" })
    .click();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Mark as read" })
      .or(page.getByRole("button", { name: "Mark as unread" })),
  ).toBeVisible();
  await page.getByRole("button", { name: "Archive", exact: true }).click();

  await expect(archiveConversation).toHaveCount(0);
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "archive",
        threadId: ARCHIVE_THREAD,
      }),
    )
    .toMatchObject({
      status: expect.stringMatching(/^(reconciling|succeeded)$/),
    });
  await undoLastTriage(page);
  await expect(archiveConversation).toBeVisible();
});

test("shows a queue_full toast when a second archive cannot be admitted", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    window.__inboxZeroMailMaxPendingOperations = 1;
  });
  const { conversations, emailAccountId } = await openMail(page);
  const first = conversationWithSubject(
    page,
    conversations,
    "Archive Action Message",
  );
  const second = conversationWithSubject(
    page,
    conversations,
    "Playwright Test Message",
  );

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
    await first.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(first).toHaveCount(0);
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "archive",
          threadId: ARCHIVE_THREAD,
        }),
      )
      .toMatchObject({ status: "reconciling" });

    await second.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(second).toBeVisible();
    await expect(
      page.locator("[data-sonner-toast]").filter({
        hasText: admissionRejectionCopy("queue_full"),
      }),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(page, testInfo, "queue-full-toast");
  } finally {
    releaseExecute();
    await page.request
      .post(`/api/threads/${ARCHIVE_THREAD}/unarchive`, {
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

test("deletes an open conversation and restores it from Trash", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const deletedConversation = conversationWithSubject(
    page,
    conversations,
    "Delete Action Message",
  );
  await deletedConversation.click();
  await expect(
    page.getByRole("heading", { name: "Delete Action Message" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^More actions/ }).click();
  await page.getByRole("menuitem", { name: /^Delete/ }).click();

  await expect(conversations).toBeVisible();
  await expect(deletedConversation).toHaveCount(0);
  await expectEngineMutation(page, emailAccountId, "trash", DELETE_THREAD);

  await openMailboxFromSidebar(page, "Trash");
  await expect(deletedConversation).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "trashed-in-trash-view");
  await undoLastTriage(page);
  await expect(deletedConversation).toHaveCount(0);
  await expectEngineMutation(page, emailAccountId, "untrash", DELETE_THREAD);
  await page.goto(`/${emailAccountId}/mail`, {
    waitUntil: "domcontentloaded",
  });
  await expect(conversations).toBeVisible({ timeout: 60_000 });
  await expect(deletedConversation).toBeVisible();
});

test("advances the split reader after archiving an open conversation", async ({
  page,
}, testInfo) => {
  await page.route("**/api/threads/thr_playwright_3?**", async (route) => {
    const response = await route.fetch();
    const body: ThreadResponse = await response.json();
    for (const message of body.thread.messages) {
      message.textHtml = "<p>Message body for keyboard shortcut coverage.</p>";
    }
    await route.fulfill({ response, json: body });
  });
  const settingsResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/mail/settings",
  );
  const { conversations, emailAccountId } = await openMail(page);
  const settingsResponse = await settingsResponsePromise;
  expect(settingsResponse.ok()).toBeTruthy();
  const settings = (await settingsResponse.json()) as MailSettingsResponse;
  const emptyReader = page.getByText("Nothing selected", { exact: true });
  if (settings.layout === "SPLIT") {
    await expect(emptyReader).toBeVisible();
  } else {
    await page
      .getByRole("button", { name: "Switch list or split view" })
      .click();
    await expect(emptyReader).toBeVisible();
  }
  const conversation = conversationWithSubject(
    page,
    conversations,
    "Second Unread Command Message",
  );
  await page.getByRole("button", { name: "Unread", exact: true }).click();
  await expect(conversation).toBeVisible();
  await conversation.click();
  await expect(
    page.getByRole("heading", { name: "Second Unread Command Message" }),
  ).toBeVisible();
  await expect(conversation).toHaveCount(0);

  let archived = false;
  let restoreSucceeded: boolean | undefined;
  try {
    const emailFrame = page
      .locator('iframe[title="Email content preview"]')
      .last();
    if (await emailFrame.count()) {
      await expect(emailFrame).toHaveAttribute("data-email-ready", "true");
      const emailBody = emailFrame.contentFrame().locator("body");
      await emailBody.click();
      await emailBody.press("h");
      await expect(
        page.getByPlaceholder("When should it return? Try Friday at 3pm"),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByPlaceholder("Type a command or search..."),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      await emailBody.click();
      await emailBody.press("e");
    } else {
      await page.getByTestId("thread-reader").click();
      await page.keyboard.press("e");
    }
    archived = true;
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "archive",
          threadId: "thr_playwright_3",
        }),
      )
      .toMatchObject({
        status: expect.stringMatching(/^(reconciling|succeeded)$/),
      });

    await expect(conversations).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("thread-id"))
      .not.toBe("thr_playwright_3");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("thread-id"))
      .not.toBeNull();
    await expect(page.getByRole("button", { name: /^Archive/ })).toBeVisible();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "split-reader-after-archive",
    );
  } finally {
    if (archived) {
      restoreSucceeded = (
        await page.request
          .post("/api/threads/thr_playwright_3/unarchive", {
            headers: { "X-Email-Account-ID": emailAccountId },
          })
          .catch(() => undefined)
      )?.ok();
    }
  }
  expect(restoreSucceeded).toBe(true);
});

test("archives two selected conversations and restores both with undo", async ({
  page,
}) => {
  const { conversations, emailAccountId } = await openMail(page);
  const first = conversationWithSubject(
    page,
    conversations,
    "Playwright Test Message",
  );
  const second = conversationWithSubject(
    page,
    conversations,
    "Read Command Message",
  );
  await first.getByRole("checkbox").click();
  await second.getByRole("checkbox").click();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(first).toHaveCount(0);
  await expect(second).toHaveCount(0);
  await expectEngineMutation(page, emailAccountId, "archive", FIRST_THREAD);
  await expectEngineMutation(page, emailAccountId, "archive", SECOND_THREAD);
  await undoLastTriage(page);
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expectEngineMutation(page, emailAccountId, "unarchive", FIRST_THREAD);
  await expectEngineMutation(page, emailAccountId, "unarchive", SECOND_THREAD);
});

test("selects ranges and opens conversations with the keyboard", async ({
  page,
}) => {
  const { conversations } = await openMail(page);
  const options = conversations.getByRole("option");
  await expect(options.first()).toBeVisible();

  await page.keyboard.press("x");
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await page.keyboard.press("Shift+j");
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("2 selected", { exact: true })).toBeHidden();

  await page.keyboard.press("j");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/thread-id=/);
  await page.keyboard.press("Escape");
  await expect(conversations).toBeVisible();
});

test("selects and clears all conversations from the list toolbar", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const options = conversations.getByRole("option");
  const conversationCount = await options.count();
  expect(conversationCount).toBeGreaterThan(1);

  const selectAll = page.getByRole("checkbox", {
    name: "Select all conversations",
  });
  await expect(selectAll).not.toBeChecked();

  await selectAll.click();

  await expect(
    page.getByText(`${conversationCount} selected`, { exact: true }),
  ).toBeVisible();
  await expect(selectAll).toBeChecked();
  await expect.poll(() => allRowsAreSelected(options, true)).toBe(true);
  await capturePlaywrightCheckpoint(page, testInfo, "select-all-conversations");

  await options.nth(1).getByRole("checkbox").click();

  await expect(
    page.getByText(`${conversationCount - 1} selected`, { exact: true }),
  ).toBeVisible();
  await expect(selectAll).toHaveAttribute("aria-checked", "mixed");

  await selectAll.click();
  await expect(selectAll).toBeChecked();
  await expect.poll(() => allRowsAreSelected(options, true)).toBe(true);

  await selectAll.click();
  await expect(selectAll).not.toBeChecked();
  await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
  await expect.poll(() => allRowsAreSelected(options, false)).toBe(true);
});

test("selects every conversation with Command A", async ({ page }) => {
  const { conversations } = await openMail(page);
  const options = conversations.getByRole("option");
  const conversationCount = await options.count();
  expect(conversationCount).toBeGreaterThan(1);

  // The toolbar slot is the mail search input now, so open the palette with
  // its keyboard shortcut instead.
  await page.keyboard.press(`${commandModifier}+KeyK`);
  const commandInput = page.getByPlaceholder("Type a command or search...");
  const query = "archive";
  await commandInput.fill(query);
  await page.keyboard.press(`${commandModifier}+KeyA`);

  await expect
    .poll(() =>
      commandInput.evaluate((input: HTMLInputElement) => ({
        end: input.selectionEnd,
        start: input.selectionStart,
      })),
    )
    .toEqual({ end: query.length, start: 0 });
  await expect.poll(() => allRowsAreSelected(options, false)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(commandInput).toBeHidden();

  await options.nth(1).getByRole("checkbox").click();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();

  await page.keyboard.press(`${commandModifier}+KeyA`);

  await expect(
    page.getByText(`${conversationCount} selected`, { exact: true }),
  ).toBeVisible();
  await expect(options).toHaveCount(conversationCount);
  await expect.poll(() => allRowsAreSelected(options, true)).toBe(true);
});

const ARCHIVE_THREAD = "thr_playwright_archive";
const DELETE_THREAD = "thr_playwright_delete";
const FIRST_THREAD = "thr_playwright_1";
const SECOND_THREAD = "thr_playwright_2";

async function expectEngineMutation(
  page: Page,
  emailAccountId: string,
  kind: string,
  threadId: string,
) {
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind,
          threadId,
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({ status: "succeeded" });
}

async function undoLastTriage(page: Page) {
  const undoButton = page
    .getByRole("region", { name: "Notifications alt+T" })
    .getByRole("button", { name: /^Undo/ });
  if (await undoButton.isVisible()) {
    await undoButton.click();
    return;
  }
  await page.keyboard.press("z");
}

function allRowsAreSelected(rows: Locator, selected: boolean) {
  return rows.evaluateAll(
    (options, expected) =>
      options.every(
        (option) => option.getAttribute("aria-selected") === String(expected),
      ),
    selected,
  );
}
