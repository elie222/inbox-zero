import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  clearWorkflowMailboxDrafts,
  countReplyThreadDrafts,
  countReplyThreadSentCopies,
  deleteProviderMessage,
  expectThreadReaderBody,
  insertInboxMailInConversation,
  openMail,
  requestMailSync,
  readLatestMailMutation,
  UNDO_WINDOW_SEND_TIMEOUT_MS,
} from "./mail-test-helpers";
import {
  expectWithinBudget,
  recordLatency,
  sampleUntilSettled,
  slowNetwork,
} from "./latency-test-helpers";

test.beforeEach(async ({ page }) => {
  await clearWorkflowMailboxDrafts(page);
});

test("sends a reply without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const { emailAccountId, sourceMessage, replyBody, network } =
    await startReplyWhileDraftSaves(context, page);

  const sampler = await sampleUntilSettled(page, {
    start: { click: "button" },
    probes: [
      { name: "composerClosed", kind: "composerGone", text: replyBody },
      { name: "replyInThread", kind: "sentReply", text: replyBody },
      { name: "replySelected", kind: "selectionOnSentReply", text: replyBody },
      { name: "undoToast", kind: "undoToast", transient: true },
    ],
  });
  await sourceMessage
    .getByRole("button", { name: "Send", exact: true })
    .click();
  const result = await sampler.finish();
  await network.restore();

  await recordLatency(testInfo, "send-reply", result, network.delayed);
  await capturePlaywrightCheckpoint(page, testInfo, "reply-sent-instantly");
  expectWithinBudget(result);

  // The send did not wait for the draft save, so the draft that save wrote
  // has to be gone once the reply is delivered.
  await expectReplyDelivered(page, emailAccountId);
  await expect.poll(() => countReplyThreadDrafts(page, emailAccountId)).toBe(0);
  await expect
    .poll(() => countReplyThreadSentCopies(page, emailAccountId, replyBody))
    .toBe(1);
  await expectThreadReaderBody(page, `${replyBody}.`);
});

test("undoes a reply sent while its draft was saving", async ({
  context,
  page,
}) => {
  const { emailAccountId, sourceMessage, editor, replyBody, network } =
    await startReplyWhileDraftSaves(context, page);

  await sourceMessage
    .getByRole("button", { name: "Send", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Notifications alt+T" })
    .getByRole("button", { name: /^Undo/ })
    .click();
  await expect(editor).toContainText(`${replyBody}.`);
  await network.restore();

  // Undo hands back a composer that keeps the draft its save created, rather
  // than one pointing at a draft that was removed.
  await expect.poll(() => countReplyThreadDrafts(page, emailAccountId)).toBe(1);
  await editor.pressSequentially(" Edited after undo.");
  await expect.poll(() => countReplyThreadDrafts(page, emailAccountId)).toBe(1);
  await expect(page.getByText(/no longer saved to your mailbox/)).toHaveCount(
    0,
  );

  await sourceMessage
    .getByRole("button", { name: "Send", exact: true })
    .click();
  await expectReplyDelivered(page, emailAccountId);
  await expect.poll(() => countReplyThreadDrafts(page, emailAccountId)).toBe(0);
  // Only the resend arrives; the undone send never went out.
  await expect
    .poll(() => countReplyThreadSentCopies(page, emailAccountId, replyBody))
    .toBe(1);
  await expectThreadReaderBody(page, "Edited after undo.");
});

test("expands an earlier message without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(
    `/${emailAccountId}/mail?thread-id=thr_playwright_reader_collapse`,
  );
  await expectThreadReaderBody(page, "Latest read message stays expanded.");
  const earlier = page.locator(
    '[data-thread-message-id="msg_playwright_reader_collapse_1"]',
  );
  await expect(earlier).toBeVisible();

  const network = await slowNetwork(context, page);
  const sampler = await sampleUntilSettled(page, {
    start: {
      click: '[data-thread-message-id="msg_playwright_reader_collapse_1"]',
    },
    probes: [
      {
        name: "bodyVisible",
        kind: "messageBody",
        messageId: "msg_playwright_reader_collapse_1",
        text: "First collapsed history message.",
      },
    ],
  });
  await earlier.getByText("Dana Example").first().click();
  const result = await sampler.finish();
  await network.restore();

  await recordLatency(testInfo, "expand-message", result, network.delayed);
  expectWithinBudget(result);
});

test("opens a synced thread without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const row = conversations
    .getByRole("option")
    .filter({ hasText: "Reader Navigation Message" })
    .first();
  await expect(row).toBeVisible({ timeout: 60_000 });

  const network = await slowNetwork(context, page);
  const sampler = await sampleUntilSettled(page, {
    start: { click: '[role="option"]' },
    probes: [
      {
        name: "bodyVisible",
        kind: "messageBody",
        messageId: "msg_playwright_reader_2",
        text: "A second message proves the complete conversation is rendered.",
      },
    ],
  });
  await row.click();
  const result = await sampler.finish();
  await network.restore();

  await recordLatency(testInfo, "open-thread", result, network.delayed);
  expectWithinBudget(result);
});

test("opens an html message without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const row = conversations
    .getByRole("option")
    .filter({ hasText: "Reader Html Message" })
    .first();
  await expect(row).toBeVisible({ timeout: 60_000 });

  const network = await slowNetwork(context, page);
  const sampler = await sampleUntilSettled(page, {
    start: { click: '[role="option"]' },
    probes: [
      {
        name: "bodyVisible",
        kind: "messageBody",
        messageId: "msg_playwright_reader_html",
        text: "A rich email body for keyboard navigation.",
      },
    ],
  });
  await row.click();
  const result = await sampler.finish();
  await network.restore();

  await recordLatency(testInfo, "open-html-thread", result, network.delayed);
  expectWithinBudget(result);
});

test("opens an email with remote images without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const bodyText = `Remote image email ${Date.now()}`;
  const messageId = await insertInboxMailInConversation(page, {
    threadId: "thr_playwright_reader_collapse",
    messageId: "msg_playwright_reader_collapse_2",
    subject: "Re: Collapsed Reader Message",
    from: "Dana Example <dana@example.com>",
    bodyText,
    // The image proxy has to rewrite this before the image may load, which
    // used to hold back the whole body.
    bodyHtml: `<p>${bodyText}</p><img src="https://images.example.com/banner.png" width="600" height="200" alt="">`,
  });
  let network: Awaited<ReturnType<typeof slowNetwork>> | undefined;
  try {
    const row = conversations
      .getByRole("option")
      .filter({ hasText: "Collapsed Reader Message" })
      .first();
    await expect
      .poll(
        async () => {
          await requestMailSync(page);
          return row.textContent();
        },
        { timeout: 60_000 },
      )
      .toContain(bodyText);
    // Sync stores the body; reading it once confirms it is on the device. The
    // reload then empties the in-memory caches, as on a fresh visit, and the
    // slow network keeps the list's own prefetch from preparing it first.
    await row.click();
    await expectThreadReaderBody(page, bodyText);
    network = await slowNetwork(context, page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Back to inbox", exact: true })
      .click();
    await expect(row).toBeVisible({ timeout: 60_000 });

    const sampler = await sampleUntilSettled(page, {
      start: { click: '[role="option"]' },
      probes: [
        { name: "bodyVisible", kind: "messageBody", messageId, text: bodyText },
      ],
    });
    await row.click();
    const result = await sampler.finish();

    await recordLatency(
      testInfo,
      "open-remote-image-email",
      result,
      network.delayed,
    );
    expectWithinBudget(result);
  } finally {
    await network?.restore();
    await deleteProviderMessage(page, messageId);
  }
});

/**
 * Opens a reply, then slows the network and waits until the composer's
 * mailbox draft save is on its way: the usual state for someone who finishes
 * typing and sends straight away.
 */
async function startReplyWhileDraftSaves(context: BrowserContext, page: Page) {
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const sourceMessage = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(sourceMessage).toBeVisible({ timeout: 60_000 });
  await sourceMessage
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  const editor = sourceMessage.getByRole("textbox", { name: "Email message" });
  const replyBody = `Latency reply ${Date.now()}`;
  await editor.pressSequentially(replyBody);

  const network = await slowNetwork(context, page);
  const draftSave = page.waitForRequest(
    (request) =>
      request.method() === "POST" && Boolean(request.headers()["next-action"]),
    { timeout: 10_000 },
  );
  await editor.pressSequentially(".");
  await draftSave;
  return { emailAccountId, sourceMessage, editor, replyBody, network };
}

async function expectReplyDelivered(page: Page, emailAccountId: string) {
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: "thr_playwright_reply",
        }),
      { timeout: UNDO_WINDOW_SEND_TIMEOUT_MS },
    )
    .toMatchObject({ status: "succeeded" });
}
