import { expect, type Page, type TestInfo } from "@playwright/test";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { Redis } from "@upstash/redis";
import { test } from "../emulated/playwright-test";
import {
  openMail,
  conversationWithSubject,
} from "../emulated/mail/mail-test-helpers";

type Sample = {
  scenario: string;
  durationMs: number;
  loaded: boolean;
  detailRequests: number;
  threadId?: string | null;
};
type ProviderEvent = {
  method: string;
  cost: number;
  reason: string | null;
  bytes: number;
  active: number;
  status: number;
};

const profile = process.env.MAIL_SIMULATION_PROFILE ?? "latency";
if (!["latency", "published-quota", "constrained"].includes(profile)) {
  throw new Error("Unknown mail simulation profile");
}
test(`measures current client under ${profile}`, async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(240_000);
  const samples: Sample[] = [];
  const phases: { events: ProviderEvent[] }[] = [];
  await configure({
    userUnits: profile === "published-quota" ? 6000 : 120_000,
    projectUnits: 1_200_000,
    concurrency: 100,
    latencyMs: 250,
    windowMs: 60_000,
    bytesPerSecond: 2_000_000,
  });
  let detailRequests = 0;
  const threadStatuses = new Map<string, number>();
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/api/threads/sim_thread_"))
      threadStatuses.set(path, response.status());
  });
  let scenarioFailed = false;
  page.on("request", (request) => {
    if (/\/api\/threads\/sim_thread_/.test(request.url())) detailRequests++;
  });
  try {
    const start = performance.now();
    const { conversations, emailAccountId } = await openMail(page);
    samples.push({
      scenario: "cold-view",
      durationMs: performance.now() - start,
      loaded: true,
      detailRequests,
    });
    // No explicit idle period: click an arbitrary visible row as soon as the list exists.
    for (const index of [4, 2, 0, 4]) {
      const row = conversationWithSubject(
        page,
        conversations,
        `Simulation thread ${String(index).padStart(4, "0")}`,
      );
      await expect(row).toBeVisible();
      const before = detailRequests;
      const started = performance.now();
      await row.click();
      const loaded = await waitForBody(page, index);
      samples.push({
        scenario: `open-${index}${index === 2 ? "-150-messages" : index === 4 ? "-large-html" : ""}`,
        durationMs: performance.now() - started,
        loaded,
        detailRequests: detailRequests - before,
      });
      const back = page.getByRole("button", {
        name: "Back to inbox",
        exact: true,
      });
      if (!(await back.isVisible())) {
        testInfo.annotations.push({
          type: "blocked-scenarios",
          description:
            "Reader navigation disappeared after a load failure; remaining interactions could not run.",
        });
        return;
      }
      await back.click();
    }
    // J/K changes threads; ArrowUp/Down navigates messages inside the reader.
    await conversationWithSubject(
      page,
      conversations,
      "Simulation thread 0000",
    ).click();
    const navigationStart = performance.now();
    const navigationRequests = detailRequests;
    for (const key of ["j", "j", "j", "k", "j", "j", "k"]) {
      await page.keyboard.press(key);
    }
    await expect(page).toHaveURL(/thread-id=sim_thread_3(?:&|$)/);
    const selectedId = new URL(page.url()).searchParams.get("thread-id");
    const selectedThread = Number(selectedId?.replace("sim_thread_", ""));
    expect(
      Number.isFinite(selectedThread) && selectedId?.startsWith("sim_thread_"),
    ).toBe(true);
    const navigationLoaded = await waitForBody(page, selectedThread);
    samples.push({
      scenario: "rapid-next-previous",
      threadId: selectedId,
      durationMs: performance.now() - navigationStart,
      loaded: navigationLoaded,
      detailRequests: detailRequests - navigationRequests,
    });
    await page
      .getByRole("button", { name: "Back to inbox", exact: true })
      .click();
    const switchStart = performance.now();
    const switchRequests = detailRequests;
    for (let index = 0; index < 12; index++) {
      const split = page.getByRole("button", {
        name: index % 2 === 0 ? "Unread" : "All",
        exact: true,
      });
      await split.click();
      await expect(split).toHaveAttribute("aria-current", "true");
    }
    await expect(
      page.getByRole("button", { name: "All", exact: true }),
    ).toHaveAttribute("aria-current", "true");
    samples.push({
      scenario: "12-rapid-split-switches",
      durationMs: performance.now() - switchStart,
      loaded: true,
      detailRequests: detailRequests - switchRequests,
    });
    await conversations.hover();
    await page.mouse.wheel(0, 3000);
    await page.mouse.wheel(0, -3000);
    // A second page shares persisted storage, but has its own in-memory cache.
    const other = await context.newPage();
    await other.goto(`/${emailAccountId}/mail`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      other.getByRole("listbox", { name: "Conversations" }),
    ).toBeVisible();
    await other.close();
    if (profile === "constrained") {
      phases.push(await snapshot());
      // Exhaust quota after warming the UI, without replacing any application response.
      await configure({
        userUnits: 0,
        projectUnits: 1_200_000,
        concurrency: 2,
        latencyMs: 250,
        windowMs: 1000,
        bytesPerSecond: 2_000_000,
      });
      const before = detailRequests;
      const started = performance.now();
      await page.goto(`/${emailAccountId}/mail?thread-id=sim_thread_30`, {
        waitUntil: "domcontentloaded",
      });
      const loaded = await waitForBody(page, 30);
      expect(threadStatuses.get("/api/threads/sim_thread_30")).toBe(429);
      samples.push({
        scenario: "uncached-open-during-quota-exhaustion",
        durationMs: performance.now() - started,
        loaded,
        detailRequests: detailRequests - before,
      });
      if (process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN) {
        const state = await new Redis({
          url: process.env.UPSTASH_REDIS_URL,
          token: process.env.UPSTASH_REDIS_TOKEN,
        }).get(`email-provider-rate-limit:${emailAccountId}`);
        await testInfo.attach("account-cooldown.json", {
          body: JSON.stringify({ recorded: state !== null }),
          contentType: "application/json",
        });
      }
      const rejected = await snapshot();
      phases.push(rejected);
      expect(rejected.events.some((event: ProviderEvent) => event.reason)).toBe(
        true,
      );
      await testInfo.attach("quota-exhaustion.json", {
        body: JSON.stringify(rejected, null, 2),
        contentType: "application/json",
      });
      const recoveryStart = performance.now();
      const recoveryRequests = detailRequests;
      await configure({
        userUnits: 6000,
        concurrency: 100,
        windowMs: 60_000,
      });
      await page.goto(`/${emailAccountId}/mail?thread-id=sim_thread_30`, {
        waitUntil: "domcontentloaded",
      });
      const recoveryLoaded = await waitForBody(page, 30);
      samples.push({
        scenario: "open-after-quota-restored",
        durationMs: performance.now() - recoveryStart,
        loaded: recoveryLoaded,
        detailRequests: detailRequests - recoveryRequests,
      });
    }
  } catch (error) {
    scenarioFailed = true;
    throw error;
  } finally {
    try {
      await report(page, testInfo, samples, phases);
    } catch (error) {
      if (!scenarioFailed) {
        expect
          .soft(false, "Simulation reporting failed; inspect the test logs")
          .toBe(true);
      }
      console.error("Simulation reporting failed", error);
      testInfo.annotations.push({
        type: "report-error",
        description: "Simulation reporting failed; inspect the test logs.",
      });
    }
  }
});

async function waitForBody(page: Page, thread: number) {
  const last = thread === 2 ? 149 : thread % 10 === 0 ? 7 : 0;
  const marker = `Simulation body ${thread} message ${last}`;
  try {
    await expect
      .poll(
        async () => {
          for (const frame of page.frames()) {
            if (
              await frame
                .getByText(marker, { exact: true })
                .first()
                .isVisible()
                .catch(() => false)
            )
              return true;
          }
          return false;
        },
        { timeout: 12_000, intervals: [25, 50, 100] },
      )
      .toBe(true);
    return true;
  } catch {
    const testInfo = test.info();
    await testInfo.attach(`body-timeout-${thread}.json`, {
      body: JSON.stringify({
        expectedThread: thread,
        actualThread: new URL(page.url()).searchParams.get("thread-id"),
        renderedMessages: await page
          .locator("li[data-thread-message-id]")
          .evaluateAll((elements) =>
            elements.map((element) =>
              element.getAttribute("data-thread-message-id"),
            ),
          ),
      }),
      contentType: "application/json",
    });
    await page.screenshot({
      path: testInfo.outputPath(`body-timeout-${thread}.png`),
    });
    return false;
  }
}

async function configure(options: Record<string, number>) {
  await expect
    .poll(
      async () => {
        const result = await fetch(
          `${process.env.GOOGLE_BASE_URL}/__simulation`,
          {
            method: "POST",
            body: JSON.stringify(options),
            headers: { "content-type": "application/json" },
          },
        );
        return result.status;
      },
      { timeout: 30_000 },
    )
    .toBe(200);
}

async function snapshot() {
  const response = await fetch(`${process.env.GOOGLE_BASE_URL}/__simulation`);
  if (!response.ok) throw new Error("Could not read simulation ledger");
  return response.json();
}

async function report(
  page: Page,
  testInfo: TestInfo,
  samples: Sample[],
  phases: { events: ProviderEvent[] }[],
) {
  const provider = await snapshot();
  const allPhases: { events: ProviderEvent[] }[] = [...phases, provider];
  const events = allPhases.flatMap((phase) => phase.events);
  const summary = {
    samples,
    provider: {
      requests: events.length,
      rejected: events.filter((event) => event.reason).length,
      acceptedUnits: events
        .filter((event) => !event.reason)
        .reduce((sum, event) => sum + event.cost, 0),
      bytes: events.reduce((sum, event) => sum + event.bytes, 0),
      peakConcurrency: Math.max(0, ...events.map((event) => event.active)),
      uncompleted: events.filter((event) => event.status === 0).length,
    },
    config: provider.config,
  };
  console.log(`MAIL_SIMULATION ${JSON.stringify(summary)}`);
  await writeFile(
    testInfo.outputPath("mail-loading-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  await writeFile(
    testInfo.outputPath("gmail-requests.json"),
    JSON.stringify(allPhases, null, 2),
  );
  await testInfo.attach("mail-loading-summary.json", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("gmail-requests.json", {
    body: JSON.stringify(allPhases, null, 2),
    contentType: "application/json",
  });
  expect(
    provider.harnessErrors,
    "Simulation proxy must support all exercised endpoints",
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("simulation.png"),
    fullPage: true,
  });
}
