import { expect, type Page } from "@playwright/test";
import { test } from "../playwright-test";
import {
  LOCAL_BUDGET_MS,
  measureInteraction,
  NETWORK_DELAY_MS,
  slowNetwork,
} from "./latency-test-helpers";
import {
  conversationWithSubject,
  deleteProviderMessage,
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
  try {
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
  } finally {
    await deleteProviderMessage(page, messageId);
  }
});

// Unread messages open expanded, so this also shows all 30 bodies at once.
test("opens a long conversation without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const runId = Date.now();
  const messageIds: string[] = [];
  try {
    for (let index = 0; index < 30; index += 1) {
      messageIds.push(
        await insertInboxMailInConversation(page, {
          threadId: "thr_playwright_reader_html",
          messageId: "msg_playwright_reader_html",
          subject: "Re: Reader Html Message",
          from: "Dana Example <dana@example.com>",
          bodyText: `Long conversation ${runId} message ${index}`,
          bodyHtml: `<p>Long conversation ${runId} message ${index}</p>`,
        }),
      );
    }
    const row = conversationWithSubject(
      page,
      conversations,
      "Reader Html Message",
    );
    await waitForRowText(page, row, `Long conversation ${runId} message 29`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(row).toBeVisible({ timeout: 60_000 });

    await measureInteraction({
      context,
      page,
      testInfo,
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
            text: `Long conversation ${runId} message ${index}`,
          })),
          budgetMs: JUST_ARRIVED_BUDGET_MS,
        },
      ],
      act: () => row.click(),
    });
  } finally {
    for (const messageId of messageIds)
      await deleteProviderMessage(page, messageId);
  }
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
  try {
    const row = conversationWithSubject(
      page,
      conversations,
      "Collapsed Reader Message",
    );
    await waitForRowText(page, row, marker);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(row).toBeVisible({ timeout: 60_000 });

    await measureInteraction({
      context,
      page,
      testInfo,
      interaction: "open-large-newsletter",
      start: { click: ROW },
      probes: [
        { name: "bodyVisible", kind: "messageBody", messageId, text: marker },
      ],
      act: () => row.click(),
    });
  } finally {
    await deleteProviderMessage(page, messageId);
  }
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
