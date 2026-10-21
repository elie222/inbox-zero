import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { conversationWithSubject } from "./mail-test-helpers";
import { getEmailAccountId } from "../account-test-helpers";

test("archives from the keyboard with immediate feedback and supports undo", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail`, { waitUntil: "domcontentloaded" });
  const conversations = page.getByRole("listbox", { name: "Conversations" });
  await expect(conversations).toBeVisible({ timeout: 180_000 });
  const row = conversationWithSubject(
    page,
    conversations,
    "Archive Action Message",
  );
  await expect(row).toBeVisible();
  // J/K moves the app's row cursor; DOM focus alone does not select an action target.
  const index = await row.evaluate((element) =>
    Array.from(
      element.closest('[role="listbox"]')!.querySelectorAll('[role="option"]'),
    ).indexOf(element),
  );
  await page.keyboard.press("k");
  for (let i = 0; i < index; i++) await page.keyboard.press("j");
  await expect(row).toHaveAttribute("tabindex", "0");

  const captureDir = process.env.ARCHIVE_CAPTURE_DIR;
  const session = await page.context().newCDPSession(page);
  const frames: Array<{ data: string; timestamp?: number }> = [];
  if (captureDir) {
    await mkdir(captureDir, { recursive: true });
    await page.screenshot({ path: join(captureDir, "before.png") });
    session.on("Page.screencastFrame", async (event) => {
      frames.push({ data: event.data, timestamp: event.metadata.timestamp });
      await session.send("Page.screencastFrameAck", {
        sessionId: event.sessionId,
      });
    });
    await session.send("Page.startScreencast", {
      format: "png",
      everyNthFrame: 1,
    });
  }
  await page.evaluate(() => {
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "e") return;
        const startedAt = performance.now();
        const rows = Array.from(
          document.querySelectorAll('[role="listbox"] [role="option"]'),
        );
        const row = rows.find((element) =>
          element.textContent?.includes("Archive Action Message"),
        )!;
        const rowKey = row.parentElement!.getAttribute("data-mail-thread-key")!;
        const nextRow = rows[rows.indexOf(row) + 1];
        const nextKey = nextRow.parentElement!.getAttribute(
          "data-mail-thread-key",
        )!;
        const rowSelector = `[data-mail-thread-key="${CSS.escape(rowKey)}"]`;
        const nextSelector = `[data-mail-thread-key="${CSS.escape(nextKey)}"] [role="option"]`;
        const nextInitialTop = document
          .querySelector(nextSelector)!
          .getBoundingClientRect().top;
        const samples: Array<{
          ms: number;
          inList: boolean;
          exitOpacity: string | null;
          nextTop: number;
          nextFocused: boolean;
        }> = [];
        const sample = () => {
          const ghost = document.querySelector("[data-archive-exit]");
          const nextRow = document.querySelector(nextSelector)!;
          samples.push({
            ms: performance.now() - startedAt,
            inList: Boolean(document.querySelector(rowSelector)),
            nextTop: nextRow.getBoundingClientRect().top,
            nextFocused: nextRow.getAttribute("tabindex") === "0",
            exitOpacity: ghost
              ? getComputedStyle(ghost.firstElementChild ?? ghost).opacity
              : null,
          });
          if (performance.now() - startedAt < 600)
            requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        Object.assign(window, {
          archiveTiming: {
            startedAt,
            nextInitialTop,
            epochMs: performance.timeOrigin + startedAt,
            samples,
          },
        });
      },
      { once: true, capture: true },
    );
  });
  await page.keyboard.press("e");
  await expect(row).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const timing = (
          window as unknown as {
            archiveTiming: { samples: Array<{ ms: number }> };
          }
        ).archiveTiming;
        return timing.samples.at(-1)?.ms ?? 0;
      }),
    )
    .toBeGreaterThan(600);
  const timing = await page.evaluate(
    () =>
      (
        window as unknown as {
          archiveTiming: {
            nextInitialTop: number;
            samples: Array<{
              ms: number;
              inList: boolean;
              exitOpacity: string | null;
              nextTop: number;
              nextFocused: boolean;
            }>;
          };
        }
      ).archiveTiming,
  );
  expect(timing.samples[0].inList).toBe(false);
  expect(timing.samples.some((sample) => sample.exitOpacity !== null)).toBe(
    true,
  );
  expect(timing.samples.every((sample) => !sample.inList)).toBe(true);
  expect(timing.samples[0].nextFocused).toBe(true);
  expect(timing.samples[0].nextTop).toBeCloseTo(timing.nextInitialTop, 0);
  expect(timing.samples.at(-1)!.nextTop).toBeLessThan(timing.nextInitialTop);
  await testInfo.attach("archive-timing", {
    body: JSON.stringify(timing, null, 2),
    contentType: "application/json",
  });
  if (captureDir) {
    await session.send("Page.stopScreencast");
    await writeFile(
      join(captureDir, "timing.json"),
      JSON.stringify(
        {
          timing,
          frames: frames.map(({ timestamp }, index) => ({ index, timestamp })),
        },
        null,
        2,
      ),
    );
    for (const [index, frame] of frames.entries())
      await writeFile(
        join(captureDir, `frame-${String(index).padStart(3, "0")}.png`),
        Buffer.from(frame.data, "base64"),
      );
  }
  await session.detach();
  await capturePlaywrightCheckpoint(page, testInfo, "single-archive");
  await page.keyboard.press("z");
  await expect(row).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "archive-undone");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("e");
  await expect(row).toHaveCount(0);
  await expect(page.locator("[data-archive-exit]")).toHaveCount(0);
  await expect(
    page.getByText("Archived", { exact: true }).last(),
  ).toBeVisible();
  await page.keyboard.press("z");
  await expect(row).toBeVisible();

  await page.emulateMedia({ reducedMotion: "no-preference" });
  const count = await conversations.getByRole("option").count();
  await conversations.getByRole("option").nth(0).getByRole("checkbox").click();
  await conversations.getByRole("option").nth(1).getByRole("checkbox").click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.locator("[data-archive-exit]")).toHaveCount(0);
  await expect(conversations.getByRole("option")).toHaveCount(count - 2);
  await expect(
    page.getByText("Archived 2 conversations", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Undo/ }).last().click();
  await expect(conversations.getByRole("option")).toHaveCount(count);
  await capturePlaywrightCheckpoint(page, testInfo, "batch-archive-undone");
});
