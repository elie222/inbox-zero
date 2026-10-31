import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { isMicrosoftPlaywright } from "../mail-provider";
import { readProviderAccessToken } from "./mail-test-helpers";

test.use({ video: "on" });

test("never paints an empty reader when moving between loaded HTML threads", async ({
  page,
}, testInfo) => {
  // Initial sync compiles routes in development and can exceed the reader's
  // recovery deadline. This scenario exercises bodies already on the device.
  const initialSync = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/enumeration") &&
      response.ok(),
    { timeout: 120_000 },
  );
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail`, { waitUntil: "domcontentloaded" });
  await initialSync;
  const conversations = page.getByRole("listbox", { name: "Conversations" });
  await expect(conversations).toBeVisible();
  const subject = isMicrosoftPlaywright()
    ? "Playwright Test Message"
    : "Cleanup Block Candidate";
  await page.evaluate(() => {
    const samples: { unfinished: boolean; empty: boolean }[] = [];
    Object.assign(window, {
      firstOpenSamples: samples,
      stopFirstOpenSamples: false,
    });
    const sample = () => {
      const readers = Array.from(
        document.querySelectorAll('[data-testid="thread-reader"]'),
      ).filter((reader) =>
        reader.checkVisibility({ visibilityProperty: true }),
      );
      const listVisible = Boolean(
        document
          .querySelector('[role="listbox"][aria-label="Conversations"]')
          ?.checkVisibility({ visibilityProperty: true }),
      );
      samples.push({
        // A reader revealed before its thread loads shows only its spinner.
        unfinished: readers.some((reader) =>
          Array.from(
            reader.querySelectorAll(
              '[data-email-ready="false"], [aria-label="Loading email"]',
            ),
          ).some((body) => body.checkVisibility({ visibilityProperty: true })),
        ),
        // Opening from the list swaps the list for the finished email, with
        // no loading placeholder or blank reader between them.
        empty: !listVisible && readers.length === 0,
      });
      if (
        !(window as unknown as { stopFirstOpenSamples: boolean })
          .stopFirstOpenSamples
      )
        requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await conversations
    .getByRole("option")
    .filter({ has: page.getByText(subject, { exact: true }) })
    .click();
  const frames = page.locator('iframe[title="Email content preview"]:visible');
  await expect
    .poll(() => frames.last().evaluate((frame) => frame.clientHeight), {
      timeout: 60_000,
    })
    .toBeGreaterThan(1);
  const firstOpenSamples = await page.evaluate(() => {
    Object.assign(window, { stopFirstOpenSamples: true });
    return (
      window as unknown as {
        firstOpenSamples: { unfinished: boolean; empty: boolean }[];
      }
    ).firstOpenSamples;
  });
  const firstOpenSummary = {
    frames: firstOpenSamples.length,
    unfinishedReaderFrames: firstOpenSamples.filter(
      (sample) => sample.unfinished,
    ).length,
    emptyFrames: firstOpenSamples.filter((sample) => sample.empty).length,
  };
  await testInfo.attach("reader-first-open-frames", {
    body: JSON.stringify(firstOpenSummary),
    contentType: "application/json",
  });
  expect(firstOpenSummary.frames).toBeGreaterThan(0);
  expect(firstOpenSummary.unfinishedReaderFrames).toBe(0);
  expect(firstOpenSummary.emptyFrames).toBe(0);
  await capturePlaywrightCheckpoint(page, testInfo, "reader-first-open-ready");

  await page.evaluate(() => {
    const samples: boolean[] = [];
    Object.assign(window, { readerPaintSamples: samples });
    const sample = () => {
      const readers = Array.from(
        document.querySelectorAll('[data-testid="thread-reader"]'),
      );
      const visibleBody = readers.some((reader) =>
        Array.from(reader.querySelectorAll("iframe")).some(
          (frame) =>
            frame.checkVisibility({ visibilityProperty: true }) &&
            frame.getBoundingClientRect().height > 1 &&
            Boolean(frame.contentDocument?.body?.textContent?.trim()),
        ),
      );
      samples.push(visibleBody);
      if (
        !(window as unknown as { stopReaderPaintSamples?: boolean })
          .stopReaderPaintSamples
      )
        requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const initialUrl = page.url();
  await page.getByRole("button", { name: /^More actions/ }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  for (const key of ["j", "k", "j", "k"]) {
    await page.keyboard.press(key);
    if (key === "j") await expect(page).not.toHaveURL(initialUrl);
    else await expect(page).toHaveURL(initialUrl);
    await expect(page.getByRole("menu")).toHaveCount(0);
    const threadId = new URL(page.url()).searchParams.get("thread-id");
    await expect(
      page
        .frameLocator('iframe[title="Email content preview"]:visible')
        .last()
        .getByText(`Navigation body for ${threadId}`),
    ).toBeVisible();
  }
  await page.keyboard.press("j");
  await page.keyboard.press("k");
  await expect(page).toHaveURL(initialUrl);
  await expect(
    page
      .frameLocator('iframe[title="Email content preview"]:visible')
      .last()
      .getByText(
        `Navigation body for ${new URL(initialUrl).searchParams.get("thread-id")}`,
      ),
  ).toBeVisible();
  const samples = await page.evaluate(() => {
    Object.assign(window, { stopReaderPaintSamples: true });
    return (window as unknown as { readerPaintSamples: boolean[] })
      .readerPaintSamples;
  });
  await testInfo.attach("reader-navigation-frames", {
    body: JSON.stringify({
      frames: samples.length,
      blankFrames: samples.filter((visible) => !visible).length,
    }),
    contentType: "application/json",
  });
  expect(samples.length).toBeGreaterThan(4);
  expect(samples.filter((visible) => !visible)).toHaveLength(0);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "reader-navigation-without-blank-frames",
  );
  await page.evaluate(() => {
    window.history.pushState(null, "", window.location.href);
  });
  await page.keyboard.press("j");
  await expect(page).not.toHaveURL(initialUrl);
  const historyDestination = page.url();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: /^More actions/ }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(initialUrl);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByRole("button", { name: /^More actions/ }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(historyDestination);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(initialUrl);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

  // Simulate a readiness signal that never arrives, even after the body loads.
  await page.evaluate(() => {
    const blockReadiness = () => {
      for (const frame of document.querySelectorAll(
        "iframe[data-email-ready]",
      )) {
        if (frame.getAttribute("data-email-ready") !== "false") {
          frame.setAttribute("data-email-ready", "false");
        }
      }
    };
    const observer = new MutationObserver(blockReadiness);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-email-ready"],
    });
    blockReadiness();
    Object.assign(window, { readerReadinessObserver: observer });
  });
  await page.keyboard.press("j");
  await expect(page).not.toHaveURL(initialUrl);
  const nextThreadId = new URL(page.url()).searchParams.get("thread-id");
  await expect(
    page
      .frameLocator('iframe[title="Email content preview"]:visible')
      .last()
      .getByText(`Navigation body for ${nextThreadId}`),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^More actions/ }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    (
      window as unknown as { readerReadinessObserver: MutationObserver }
    ).readerReadinessObserver.disconnect();
  });
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("keeps the reader complete during rapid navigation and archive bursts", async ({
  page,
}, testInfo) => {
  test.skip(isMicrosoftPlaywright(), "Uses Gmail emulator message insertion");
  const token = await readProviderAccessToken();
  const subjects = Array.from(
    { length: 32 },
    (_, index) => `Reader stress ${index}`,
  );
  const createdAt = Date.now();
  for (let offset = 0; offset < subjects.length; offset += 8) {
    await Promise.all(
      subjects.slice(offset, offset + 8).map(async (subject, index) => {
        const position = offset + index;
        const response = await page.request.post(
          `${process.env.GOOGLE_BASE_URL}/gmail/v1/users/me/messages`,
          {
            headers: { Authorization: `Bearer ${token}` },
            data: {
              threadId: `thr_reader_stress_${position}`,
              from: "Reader Example <reader@example.com>",
              to: process.env.PLAYWRIGHT_TEST_EMAIL,
              subject,
              body_html: `<p>Body for ${subject}</p>${"<p>A synthetic paragraph for layout measurement.</p>".repeat(2 + (position % 10))}`,
              labelIds: ["INBOX"],
              internalDate: String(createdAt + position * 1000),
            },
          },
        );
        expect(response.ok(), await response.text()).toBe(true);
      }),
    );
  }
  const initialSync = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/enumeration") &&
      response.ok(),
    { timeout: 120_000 },
  );
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail`, { waitUntil: "domcontentloaded" });
  await initialSync;
  await page
    .getByRole("listbox", { name: "Conversations" })
    .getByRole("option")
    .filter({ has: page.getByText(subjects[31], { exact: true }) })
    .click();
  await expect(
    page
      .frameLocator('iframe[title="Email content preview"]:visible')
      .last()
      .getByText(`Body for ${subjects[31]}`, { exact: true }),
  ).toBeVisible();

  await page.evaluate(() => {
    const frames: {
      time: number;
      subject: string;
      blank: boolean;
      mismatch: boolean;
      unfinished: boolean;
    }[] = [];
    const keys: { time: number; key: string }[] = [];
    const recordKey = (event: KeyboardEvent) => {
      if (["j", "k", "e"].includes(event.key))
        keys.push({ time: performance.now(), key: event.key });
    };
    document.addEventListener("keydown", recordKey, true);
    const capture = { frames, keys, stopped: false, recordKey };
    Object.assign(window, { readerStressCapture: capture });
    const sample = () => {
      const reader = Array.from(
        document.querySelectorAll('[data-testid="thread-reader"]'),
      ).find((element) =>
        element.checkVisibility({ visibilityProperty: true }),
      );
      const subject = reader?.querySelector("h1")?.textContent?.trim() ?? "";
      const bodies = reader
        ? Array.from(reader.querySelectorAll("iframe")).filter((frame) =>
            frame.checkVisibility({ visibilityProperty: true }),
          )
        : [];
      const body = bodies
        .map((frame) => frame.contentDocument?.body?.textContent ?? "")
        .join(" ");
      frames.push({
        time: performance.now(),
        subject,
        blank:
          !body.trim() ||
          bodies.some((frame) => frame.getBoundingClientRect().height <= 1),
        mismatch: bodies.some(
          (frame) =>
            frame.contentDocument?.querySelector("p")?.textContent?.trim() !==
            `Body for ${subject}`,
        ),
        unfinished: bodies.some((frame) => frame.dataset.emailReady !== "true"),
      });
      if (!capture.stopped) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const bursts: {
    key: string;
    count: number;
    settleMs: number;
    subject: string;
    advanced: number;
  }[] = [];
  let position = 31;
  for (const { key, count, repetitions } of [
    { key: "j", count: 4, repetitions: 6 },
    { key: "k", count: 4, repetitions: 6 },
    { key: "e", count: 3, repetitions: 4 },
    { key: "e", count: 1, repetitions: 12 },
  ]) {
    for (let burst = 0; burst < repetitions; burst++) {
      await page.keyboard.type(key.repeat(count), { delay: 60 });
      const previousPosition = position;
      if (key === "e") {
        // Archive is disabled until the next email is visible. Measure keys
        // skipped during a burst rather than queueing unseen mutations.
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
        const subject = await page
          .getByRole("heading", { level: 1 })
          .innerText();
        position = subjects.indexOf(subject);
        expect(position).toBeGreaterThanOrEqual(previousPosition - count);
        expect(position).toBeLessThan(previousPosition);
        if (count === 1) expect(position).toBe(previousPosition - 1);
      } else {
        position += key === "k" ? count : -count;
      }
      const subject = subjects[position];
      await expect(
        page.getByRole("heading", { name: subject, exact: true }),
      ).toBeVisible();
      await expect(
        page
          .frameLocator('iframe[title="Email content preview"]:visible')
          .last()
          .getByText(`Body for ${subject}`, { exact: true }),
      ).toBeVisible();
      const settleMs = await page.evaluate(() => {
        const capture = (
          window as unknown as {
            readerStressCapture: { keys: { time: number }[] };
          }
        ).readerStressCapture;
        return performance.now() - capture.keys.at(-1)!.time;
      });
      bursts.push({
        key,
        count,
        subject,
        settleMs,
        advanced: Math.abs(position - previousPosition),
      });
    }
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      `reader-rapid-${key}-${count}`,
    );
  }
  const capture = await page.evaluate(() => {
    const capture = (
      window as unknown as {
        readerStressCapture: {
          frames: {
            time: number;
            subject: string;
            blank: boolean;
            mismatch: boolean;
            unfinished: boolean;
          }[];
          keys: { time: number; key: string }[];
          stopped: boolean;
          recordKey: (event: KeyboardEvent) => void;
        };
      }
    ).readerStressCapture;
    capture.stopped = true;
    document.removeEventListener("keydown", capture.recordKey, true);
    return { frames: capture.frames, keys: capture.keys };
  });
  const summary = {
    emails: subjects.length,
    bursts,
    frames: capture.frames.length,
    blankFrames: capture.frames.filter((frame) => frame.blank).length,
    mismatchedFrames: capture.frames.filter((frame) => frame.mismatch).length,
    unfinishedFrames: capture.frames.filter((frame) => frame.unfinished).length,
    skippedArchiveKeys: bursts
      .filter((burst) => burst.key === "e")
      .reduce((sum, burst) => sum + burst.count - burst.advanced, 0),
    reversedFrames: capture.frames.filter((frame, index) => {
      if (!index) return false;
      const previous = subjects.indexOf(capture.frames[index - 1].subject);
      const current = subjects.indexOf(frame.subject);
      const key = capture.keys.findLast((key) => key.time <= frame.time)?.key;
      if (previous < 0 || current < 0 || !key) return false;
      return key === "k" ? current < previous : current > previous;
    }).length,
  };
  await testInfo.attach("reader-stress-summary", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("reader-stress-frames", {
    body: JSON.stringify(capture),
    contentType: "application/json",
  });
  console.log("Reader stress summary", JSON.stringify(summary));
  expect(summary.frames).toBeGreaterThan(20);
  expect(summary.blankFrames).toBe(0);
  expect(summary.mismatchedFrames).toBe(0);
  expect(summary.unfinishedFrames).toBe(0);
  expect(summary.reversedFrames).toBe(0);
});
