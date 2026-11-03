import type { BrowserContext, Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

// Every request to the app, including mailbox sync and draft saves, is held
// this long. Anything a user waits on that depends on the network therefore
// takes at least this long, which makes "waits on the network" an unambiguous
// failure instead of a flaky timing threshold.
export const NETWORK_DELAY_MS = 2000;
// Local work has to finish well inside the injected delay. The margin absorbs
// slow CI machines and development builds without letting a network wait pass.
export const LOCAL_BUDGET_MS = 1000;
const MAX_SAMPLE_MS = 20_000;

/** What starts the clock: a click inside `click`, or pressing `key`. */
export type LatencyStart = { click: string } | { key: string };

export type ProbeSpec = (
  | { name: string; kind: "composerGone"; text: string }
  | { name: string; kind: "sentReply"; text: string }
  | { name: string; kind: "selectionOnSentReply"; text: string }
  // Undo is offered only for the undo window, so it is expected to go away.
  | { name: string; kind: "undoToast"; transient: true }
  | { name: string; kind: "messageBody"; messageId: string; text: string }
  /** Every listed message shows its text. */
  | {
      name: string;
      kind: "messageBodies";
      bodies: { messageId: string; text: string }[];
    }
  /** At least `minCount` rendered matches of `selector`, holding `text` if given. */
  | {
      name: string;
      kind: "element";
      selector: string;
      text?: string;
      minCount?: number;
    }
  /** No rendered match of `selector` holding `text` if given. */
  | { name: string; kind: "noElement"; selector: string; text?: string }
  /** The reader shows the conversation with this subject, its bodies ready. */
  | { name: string; kind: "readerShows"; subject: string }
) & {
  /** Overrides the local budget where a round trip is inherent. */
  budgetMs?: number;
};

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
export async function sampleUntilSettled(
  page: Page,
  options: { start: LatencyStart; probes: ProbeSpec[] },
) {
  await page.evaluate(({ start, probes }) => {
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
    if ("key" in start)
      document.addEventListener(
        "keydown",
        (event) => {
          if (state.startedAt === null && event.key === start.key)
            state.startedAt = event.timeStamp;
        },
        { capture: true },
      );
    else
      document.addEventListener(
        "click",
        (event) => {
          if (state.startedAt !== null) return;
          if (
            event.target instanceof Element &&
            event.target.closest(start.click)
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
    // The body itself, not the row: a collapsed row's header repeats the
    // start of its body as a snippet.
    const bodyShowsText = (messageId: string, text: string) => {
      const row = document.querySelector(
        `li[data-thread-message-id="${CSS.escape(messageId)}"]`,
      );
      if (!row || !isRendered(row)) return false;
      return (
        Array.from(row.querySelectorAll("pre")).some(
          (body) =>
            isRendered(body) && (body as HTMLElement).innerText.includes(text),
        ) ||
        Array.from(row.querySelectorAll("iframe")).some(
          (frame) =>
            frame.dataset.emailReady === "true" &&
            isRendered(frame) &&
            Boolean(frame.contentDocument?.body?.innerText.includes(text)),
        )
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
        case "messageBody":
          return bodyShowsText(probe.messageId, probe.text);
        case "messageBodies":
          return probe.bodies.every(({ messageId, text }) =>
            bodyShowsText(messageId, text),
          );
        case "element": {
          const matches = Array.from(
            document.querySelectorAll(probe.selector),
          ).filter((element) =>
            probe.text === undefined
              ? isRendered(element)
              : showsText(element, probe.text),
          );
          return matches.length >= (probe.minCount ?? 1);
        }
        case "noElement":
          return !Array.from(document.querySelectorAll(probe.selector)).some(
            (element) =>
              probe.text === undefined
                ? isRendered(element)
                : showsText(element, probe.text),
          );
        case "readerShows": {
          // The reader keeps the previous conversation mounted while the next
          // one prepares, so look for whichever reader shows this one.
          const reader = Array.from(
            document.querySelectorAll('[data-testid="thread-reader"]'),
          ).find((candidate) => showsText(candidate, probe.subject));
          if (!reader) return false;
          const messages = Array.from(
            reader.querySelectorAll("li[data-thread-message-id]"),
          ).filter(isRendered);
          return (
            messages.length > 0 &&
            !reader.querySelector('[data-email-ready="false"]') &&
            Array.from(reader.querySelectorAll("iframe")).every(
              (frame) =>
                frame.dataset.emailReady === "true" || !isRendered(frame),
            )
          );
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

export async function slowNetwork(context: BrowserContext, page: Page) {
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

export async function recordLatency(
  testInfo: TestInfo,
  interaction: string,
  result: LatencyResult,
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

export function expectWithinBudget(
  result: LatencyResult,
  budgets: Record<string, number> = {},
) {
  expect(result.started, "the click that starts the timer was seen").toBe(true);
  for (const probe of result.probes) {
    if (probe.transient) {
      expect
        .soft(probe.firstMs ?? Number.POSITIVE_INFINITY, probe.name)
        .toBeLessThan(budgets[probe.name] ?? LOCAL_BUDGET_MS);
      continue;
    }
    expect.soft(probe.flickers, `${probe.name} never disappears`).toBe(0);
    expect
      .soft(probe.settledMs, `${probe.name} settles within budget`)
      .not.toBeNull();
    expect
      .soft(probe.settledMs ?? Number.POSITIVE_INFINITY, probe.name)
      .toBeLessThan(budgets[probe.name] ?? LOCAL_BUDGET_MS);
  }
}

type LatencyResult = Awaited<
  ReturnType<Awaited<ReturnType<typeof sampleUntilSettled>>["finish"]>
>;

/**
 * Times one interaction under a slow network: everything set up before this
 * runs on a normal network, then `act` starts the clock and `probes` say what
 * the finished state looks like.
 */
export async function measureInteraction({
  context,
  page,
  testInfo,
  interaction,
  start,
  probes,
  act,
  network: slowedEarlier,
}: {
  context: BrowserContext;
  page: Page;
  testInfo: TestInfo;
  interaction: string;
  start: LatencyStart;
  probes: ProbeSpec[];
  act: () => Promise<void>;
  /** A network slowed before setup, such as a reload, that must also be slow. */
  network?: Awaited<ReturnType<typeof slowNetwork>>;
}) {
  const network = slowedEarlier ?? (await slowNetwork(context, page));
  let result: LatencyResult;
  try {
    const sampler = await sampleUntilSettled(page, { start, probes });
    await act();
    result = await sampler.finish();
  } finally {
    await network.restore();
  }
  await recordLatency(testInfo, interaction, result, network.delayed);
  expectWithinBudget(
    result,
    Object.fromEntries(
      probes.flatMap((probe) =>
        probe.budgetMs === undefined ? [] : [[probe.name, probe.budgetMs]],
      ),
    ),
  );
  return result;
}

/**
 * Runs a test body and its cleanup. A cleanup failure is reported only when
 * the body passed, so it never hides the failure the body found.
 */
export async function withCleanup(
  body: () => Promise<void>,
  cleanup: () => Promise<void>,
) {
  let bodyFailed = false;
  let bodyError: unknown;
  try {
    await body();
  } catch (error) {
    bodyFailed = true;
    bodyError = error;
  }
  try {
    await cleanup();
  } catch (error) {
    if (!bodyFailed) throw error;
  }
  if (bodyFailed) throw bodyError;
}
