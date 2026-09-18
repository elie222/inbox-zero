import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

test("exposes engine diagnostics after metadata coverage", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  await expect(conversations.getByRole("option").first()).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const seam = window.__inboxZeroMailInspect;
          if (!seam) return { present: false, coverageComplete: false };
          const diagnostics = (await seam.read()) as {
            coverage?: Array<{ metadata: string }>;
          };
          return {
            present: true,
            coverageComplete:
              (diagnostics.coverage?.length ?? 0) > 0 &&
              diagnostics.coverage?.every(
                (item) => item.metadata === "complete",
              ),
          };
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({ present: true, coverageComplete: true });
  const inspect = await page.evaluate(async () => {
    const seam = window.__inboxZeroMailInspect;
    if (!seam) return { present: false as const };
    const diagnostics = (await seam.read()) as {
      accountId?: string;
      connection?: string;
      coverage?: Array<{ metadata: string }>;
      commands?: unknown[];
    };
    return {
      present: true as const,
      accountId: diagnostics.accountId ?? seam.accountId,
      role: seam.role,
      capabilities: seam.capabilities,
      connection: diagnostics.connection,
      coverageComplete:
        (diagnostics.coverage?.length ?? 0) > 0 &&
        diagnostics.coverage?.every((item) => item.metadata === "complete"),
      commandCount: diagnostics.commands?.length ?? 0,
    };
  });
  await capturePlaywrightCheckpoint(page, testInfo, "mail-engine-inspect");
  expect(await conversations.getByRole("option").count()).toBeGreaterThan(0);
  expect(inspect.present).toBe(true);
  expect(inspect.accountId).toBe(emailAccountId);
  expect(inspect.role).toBe("owner");
  expect(inspect.capabilities).toEqual({
    worker: true,
    locks: true,
    opfs: true,
  });
  expect(inspect.connection).toBe("ready");
  expect(inspect.coverageComplete).toBe(true);
  await expect(
    page.getByRole("heading", {
      name: "Reconnect this account to continue syncing.",
    }),
  ).toHaveCount(0);
});

test("serves a second tab as a follower of the owner engine", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  await expect(conversations.getByRole("option").first()).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(async () => page.evaluate(() => window.__inboxZeroMailInspect?.role))
    .toBe("owner");

  const follower = await page.context().newPage();
  await follower.goto(page.url(), { waitUntil: "domcontentloaded" });
  await expect(
    follower.getByRole("listbox", { name: "Conversations" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    follower
      .getByRole("listbox", { name: "Conversations" })
      .getByRole("option"),
  ).not.toHaveCount(0);
  await expect
    .poll(
      async () => follower.evaluate(() => window.__inboxZeroMailInspect?.role),
      { timeout: 60_000 },
    )
    .toBe("follower");
  expect(await page.evaluate(() => window.__inboxZeroMailInspect?.role)).toBe(
    "owner",
  );
  expect(
    await follower.evaluate(() => window.__inboxZeroMailInspect?.accountId),
  ).toBe(emailAccountId);
  await capturePlaywrightCheckpoint(follower, testInfo, "mail-engine-follower");
  await follower.close();
});

test("opens account reconnect from blocked_auth catch-up", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.route("**/api/mail/v1/accounts/**/changes", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      json: {
        protocolVersion: 1,
        requestId: "playwright-blocked-auth",
        error: {
          code: "blocked_auth",
          retryable: true,
          retryAfterMs: null,
        },
      },
    });
  });
  await expect(
    page.getByRole("heading", {
      name: "Reconnect this account to continue syncing.",
    }),
  ).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(async () => {
      const diagnostics = (await page.evaluate(async () => {
        const seam = window.__inboxZeroMailInspect;
        return seam ? seam.read() : null;
      })) as { connection?: string } | null;
      return diagnostics?.connection;
    })
    .toBe("blocked_auth");

  const reconnectPath = `/${emailAccountId}/mail?reconnect=blocked`;
  await page.route("**/api/google/linking/auth-url**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { url: reconnectPath },
    });
  });
  await capturePlaywrightCheckpoint(page, testInfo, "mail-engine-blocked-auth");
  await page.getByRole("button", { name: "Reconnect" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${emailAccountId}/mail\\?reconnect=blocked`),
  );
});
