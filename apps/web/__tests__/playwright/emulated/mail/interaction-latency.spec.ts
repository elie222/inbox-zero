import type { BrowserContext, Page, TestInfo } from "@playwright/test";
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

// Every request to the app, including mailbox sync and draft saves, is held
// this long. Anything a user waits on that depends on the network therefore
// takes at least this long, which makes "waits on the network" an unambiguous
// failure instead of a flaky timing threshold.
const NETWORK_DELAY_MS = 2000;
// Local work has to finish well inside the injected delay. The margin absorbs
// slow CI machines and development builds without letting a network wait pass.
const LOCAL_BUDGET_MS = 1000;
const MAX_SAMPLE_MS = 20_000;

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
    startSelector: "button",
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
    startSelector:
      '[data-thread-message-id="msg_playwright_reader_collapse_1"]',
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
    startSelector: '[role="option"]',
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
    startSelector: '[role="option"]',
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
      startSelector: '[role="option"]',
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

type ProbeSpec =
  | { name: string; kind: "composerGone"; text: string }
  | { name: string; kind: "sentReply"; text: string }
  | { name: string; kind: "selectionOnSentReply"; text: string }
  // Undo is offered only for the undo window, so it is expected to go away.
  | { name: string; kind: "undoToast"; transient: true }
  | { name: string; kind: "messageBody"; messageId: string; text: string };

type ProbeResult = {
  name: string;
  /** Milliseconds from the click until the state first showed. */
  firstMs: number | null;
  /** Milliseconds from the click until the state showed for good. */
  settledMs: number | null;
  /** Times the state appeared and then went away again. */
  flickers: number;
};

type LatencyWindow = Window & {
  __interactionLatency?: {
    startedAt: number | null;
    frame: number;
    results: ProbeResult[];
    showing: boolean[];
    transient: boolean[];
  };
};

/**
 * Tracks each probe on every animation frame from the click on
 * `startSelector`, so timings come from the page's own clock rather than
 * Playwright's polling.
 */
async function sampleUntilSettled(
  page: Page,
  options: { startSelector: string; probes: ProbeSpec[] },
) {
  await page.evaluate(({ startSelector, probes }) => {
    const state = {
      startedAt: null as number | null,
      frame: 0,
      results: probes.map((probe) => ({
        name: probe.name,
        firstMs: null as number | null,
        settledMs: null as number | null,
        flickers: 0,
      })),
      showing: probes.map(() => false),
      transient: probes.map((probe) => "transient" in probe),
    };
    (window as LatencyWindow).__interactionLatency = state;
    document.addEventListener(
      "click",
      (event) => {
        if (state.startedAt !== null) return;
        if (
          event.target instanceof Element &&
          event.target.closest(startSelector)
        )
          state.startedAt = event.timeStamp;
      },
      { capture: true },
    );

    const isRendered = (element: Element) => {
      if (element.closest('[aria-hidden="true"]')) return false;
      const rect = element.getBoundingClientRect();
      return rect.height > 0 && rect.width > 0;
    };
    const showsText = (container: Element, text: string) => {
      if (!isRendered(container)) return false;
      if ((container as HTMLElement).innerText.includes(text)) return true;
      return Array.from(container.querySelectorAll("iframe")).some(
        (frame) =>
          frame.dataset.emailReady === "true" &&
          isRendered(frame) &&
          Boolean(frame.contentDocument?.body?.innerText.includes(text)),
      );
    };
    const sentReplyRow = (text: string) =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          "li[data-thread-message-id][data-send-operation-id]",
        ),
      ).find((row) => showsText(row, text));

    const check = (probe: (typeof probes)[number]) => {
      switch (probe.kind) {
        case "composerGone":
          return !Array.from(
            document.querySelectorAll('[contenteditable="true"]'),
          ).some((editor) => editor.textContent?.includes(probe.text));
        case "sentReply":
          return Boolean(sentReplyRow(probe.text));
        case "selectionOnSentReply": {
          const row = sentReplyRow(probe.text);
          const bar = row?.parentElement?.querySelector(
            ':scope > li[role="presentation"]',
          );
          if (!row || !bar) return false;
          // The bar is decorative, so it is aria-hidden itself; only its box counts.
          const barRect = bar.getBoundingClientRect();
          if (barRect.height === 0) return false;
          const rowRect = row.getBoundingClientRect();
          return (
            Math.abs(barRect.top - rowRect.top) < 2 &&
            Math.abs(barRect.height - rowRect.height) < 2
          );
        }
        case "undoToast":
          return Array.from(
            document.querySelectorAll('[aria-label^="Notifications"] button'),
          ).some(
            (button) =>
              button.textContent?.trim().startsWith("Undo") &&
              isRendered(button),
          );
        case "messageBody": {
          const row = document.querySelector(
            `li[data-thread-message-id="${CSS.escape(probe.messageId)}"]`,
          );
          return Boolean(row && showsText(row, probe.text));
        }
      }
    };

    const sample = () => {
      if (state.startedAt !== null) {
        const elapsed = performance.now() - state.startedAt;
        probes.forEach((probe, index) => {
          const showing = check(probe);
          const result = state.results[index];
          if (showing && !state.showing[index]) {
            result.firstMs ??= elapsed;
            result.settledMs = elapsed;
          } else if (!showing && state.showing[index]) {
            result.flickers += 1;
            result.settledMs = null;
          }
          state.showing[index] = showing;
        });
      }
      state.frame = requestAnimationFrame(sample);
    };
    sample();
  }, options);

  return {
    /**
     * Keeps sampling past the injected network delay, so a state that only
     * appears once a request returns, or that flickers when one does, is seen.
     */
    finish: async () => {
      // Report how long a slow state actually took rather than just that it
      // missed the budget, then watch one more delay for anything undoing it.
      await page
        .waitForFunction(
          () =>
            (window as LatencyWindow).__interactionLatency?.results.every(
              (result) => result.firstMs !== null,
            ),
          undefined,
          { timeout: MAX_SAMPLE_MS },
        )
        .catch(() => {});
      await page.waitForTimeout(NETWORK_DELAY_MS * 2);
      return page.evaluate(() => {
        const state = (window as LatencyWindow).__interactionLatency;
        if (!state) throw new Error("Latency sampler was not installed");
        cancelAnimationFrame(state.frame);
        return {
          started: state.startedAt !== null,
          probes: state.results.map((result, index) => ({
            ...result,
            transient: state.transient[index],
            settledMs: state.showing[index] ? result.settledMs : null,
          })),
        };
      });
    },
  };
}

async function slowNetwork(context: BrowserContext, page: Page) {
  const origin = new URL(page.url()).origin;
  const delayed: { request: string; atMs: number }[] = [];
  const enabledAt = Date.now();
  const handler = async (
    route: Parameters<Parameters<BrowserContext["route"]>[1]>[0],
  ) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith("/_next/")) {
      await route.fallback();
      return;
    }
    delayed.push({
      request: `${route.request().method()} ${url.pathname}`,
      atMs: Date.now() - enabledAt,
    });
    await new Promise((resolve) => setTimeout(resolve, NETWORK_DELAY_MS));
    await route.fallback().catch(() => {});
  };
  await context.route("**/*", handler);
  return {
    delayed,
    restore: () => context.unroute("**/*", handler),
  };
}

async function recordLatency(
  testInfo: TestInfo,
  interaction: string,
  result: Awaited<
    ReturnType<Awaited<ReturnType<typeof sampleUntilSettled>>["finish"]>
  >,
  delayedRequests: { request: string; atMs: number }[],
) {
  const report = {
    interaction,
    networkDelayMs: NETWORK_DELAY_MS,
    budgetMs: LOCAL_BUDGET_MS,
    ...result,
    delayedRequests,
  };
  console.log(`INTERACTION_LATENCY ${JSON.stringify(report)}`);
  await testInfo.attach(`latency-${interaction}.json`, {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
}

function expectWithinBudget(
  result: Awaited<
    ReturnType<Awaited<ReturnType<typeof sampleUntilSettled>>["finish"]>
  >,
) {
  expect(result.started, "the click that starts the timer was seen").toBe(true);
  for (const probe of result.probes) {
    if (probe.transient) {
      expect
        .soft(probe.firstMs ?? Number.POSITIVE_INFINITY, probe.name)
        .toBeLessThan(LOCAL_BUDGET_MS);
      continue;
    }
    expect.soft(probe.flickers, `${probe.name} never disappears`).toBe(0);
    expect
      .soft(probe.settledMs, `${probe.name} settles within budget`)
      .not.toBeNull();
    expect
      .soft(probe.settledMs ?? Number.POSITIVE_INFINITY, probe.name)
      .toBeLessThan(LOCAL_BUDGET_MS);
  }
}

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
