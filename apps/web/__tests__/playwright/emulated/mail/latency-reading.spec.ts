import { expect, type Page } from "@playwright/test";
import { test } from "../playwright-test";
import {
  LOCAL_BUDGET_MS,
  measureInteraction,
  NETWORK_DELAY_MS,
  slowNetwork,
  withCleanup,
} from "./latency-test-helpers";
import {
  conversationWithSubject,
  deleteProviderMessage,
  expectThreadReaderBody,
  insertInboxMailInConversation,
  openMail,
  requestMailSync,
} from "./mail-test-helpers";

const ROW = '[role="option"]';
// Sync fetches a new message's body in the request after its metadata, so a
// message opened the moment it appears is at most one round trip from ready.
// Anything slower means other work is holding the body back.
const JUST_ARRIVED_BUDGET_MS = NETWORK_DELAY_MS + LOCAL_BUDGET_MS;

// New mail reaches the device through sync, which takes network round trips
// of its own; this opens it the moment its row appears.
test("opens newly arrived mail without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const bodyText = `Just arrived ${Date.now()}`;
  const messageId = await insertInboxMailInConversation(page, {
    threadId: "thr_playwright_reader",
    messageId: "msg_playwright_reader_2",
    subject: "Re: Reader Navigation Message",
    from: "Dana Example <dana@example.com>",
    bodyText,
    bodyHtml: `<p>${bodyText}</p>`,
  });
  await withCleanup(
    async () => {
      const row = conversationWithSubject(
        page,
        conversations,
        "Reader Navigation Message",
      );
      const network = await slowNetwork(context, page);
      try {
        await waitForRowText(page, row, bodyText);
      } finally {
        await network.restore();
      }

      await measureInteraction({
        context,
        page,
        testInfo,
        interaction: "open-new-mail",
        start: { click: ROW },
        probes: [
          {
            name: "bodyVisible",
            kind: "messageBody",
            messageId,
            text: bodyText,
            budgetMs: JUST_ARRIVED_BUDGET_MS,
          },
        ],
        act: () => row.click(),
      });
    },
    () => deleteProviderMessage(page, messageId),
  );
});

// Unread messages open expanded, so this shows all 20 bodies at once. Up to
// 20 missing bodies arrive in one request; each further 20 takes another.
test("opens a long conversation without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const runId = Date.now();
  const messageIds: string[] = [];
  await withCleanup(
    async () => {
      for (let index = 0; index < 20; index += 1) {
        messageIds.push(
          await insertInboxMailInConversation(page, {
            threadId: "thr_playwright_reader_html",
            messageId: "msg_playwright_reader_html",
            subject: "Re: Reader Html Message",
            from: "Dana Example <dana@example.com>",
            bodyText: `Long conversation ${runId} message [${index}]`,
            bodyHtml: `<p>Long conversation ${runId} message [${index}]</p>`,
          }),
        );
      }
      const row = conversationWithSubject(
        page,
        conversations,
        "Reader Html Message",
      );
      await waitForRowText(
        page,
        row,
        `Long conversation ${runId} message [19]`,
      );
      // Slow before reloading, so the bodies cannot arrive ahead of the click.
      const network = await slowNetwork(context, page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(row).toBeVisible({ timeout: 60_000 });

      await measureInteraction({
        context,
        page,
        testInfo,
        network,
        interaction: "open-long-conversation",
        start: { click: ROW },
        probes: [
          {
            name: "everyBodyReady",
            kind: "readerShows",
            subject: "Reader Html Message",
            budgetMs: JUST_ARRIVED_BUDGET_MS,
          },
          {
            name: "allBodiesVisible",
            kind: "messageBodies",
            bodies: messageIds.map((messageId, index) => ({
              messageId,
              text: `Long conversation ${runId} message [${index}]`,
            })),
            budgetMs: JUST_ARRIVED_BUDGET_MS,
          },
        ],
        act: () => row.click(),
      });
    },
    () => deleteAll(page, messageIds),
  );
});

test("opens a large newsletter without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const marker = `Large newsletter ${Date.now()}`;
  const messageId = await insertInboxMailInConversation(page, {
    threadId: "thr_playwright_reader_collapse",
    messageId: "msg_playwright_reader_collapse_2",
    subject: "Re: Collapsed Reader Message",
    from: "News Example <news@example.com>",
    bodyText: marker,
    bodyHtml: largeNewsletterHtml(marker),
  });
  await withCleanup(
    async () => {
      const row = conversationWithSubject(
        page,
        conversations,
        "Collapsed Reader Message",
      );
      await waitForRowText(page, row, marker);
      // Read it once so its body is on the device: this case times rendering
      // a large body, not downloading one. The slow reload then empties the
      // in-memory caches without letting a fast prefetch prepare it first.
      await row.click();
      await expectThreadReaderBody(page, marker);
      const network = await slowNetwork(context, page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page
        .getByRole("button", { name: "Back to inbox", exact: true })
        .click();
      await expect(row).toBeVisible({ timeout: 60_000 });

      await measureInteraction({
        context,
        page,
        testInfo,
        network,
        interaction: "open-large-newsletter",
        start: { click: ROW },
        probes: [
          { name: "bodyVisible", kind: "messageBody", messageId, text: marker },
        ],
        act: () => row.click(),
      });
    },
    () => deleteProviderMessage(page, messageId),
  );
});

async function waitForRowText(
  page: Page,
  row: ReturnType<Page["locator"]>,
  text: string,
) {
  await expect
    .poll(
      async () => {
        await requestMailSync(page);
        return row.textContent();
      },
      { timeout: 60_000 },
    )
    .toContain(text);
}

// About 800 KB of table-heavy markup, the shape of a large marketing email.
function largeNewsletterHtml(marker: string) {
  const rows = Array.from(
    { length: 2500 },
    (_, index) =>
      `<tr><td style="padding:8px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;color:#333">Item ${index}: a product description long enough to wrap onto a second line in the reader</td><td style="padding:8px;text-align:right">$${index}.00</td></tr>`,
  ).join("");
  return `<p>${marker}</p><table width="600" cellpadding="0" cellspacing="0">${rows}</table>`;
}

// Removes every inserted message even if one removal fails, then reports.
async function deleteAll(page: Page, messageIds: string[]) {
  const results = await Promise.allSettled(
    messageIds.map((messageId) => deleteProviderMessage(page, messageId)),
  );
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length)
    throw new Error(`Could not remove ${failed.length} inserted message(s)`);
}
