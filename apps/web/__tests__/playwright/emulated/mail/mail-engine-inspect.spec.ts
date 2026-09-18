import { expect, type Route } from "@playwright/test";
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

test("keeps the owner engine after a full reload", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  await expect
    .poll(async () => page.evaluate(() => window.__inboxZeroMailInspect?.role))
    .toBe("owner");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(conversations.getByRole("option").first()).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(
      async () => page.evaluate(() => window.__inboxZeroMailInspect?.role),
      {
        timeout: 60_000,
      },
    )
    .toBe("owner");
  expect(
    await page.evaluate(() => window.__inboxZeroMailInspect?.accountId),
  ).toBe(emailAccountId);
  await capturePlaywrightCheckpoint(page, testInfo, "mail-engine-reload");
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
  const fulfillBlockedAuth = async (route: Route) => {
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
  };
  // Gmail idle catch-up reads /changes. Outlook without a folder-delta
  // cursor re-enumerates instead, so both resources must surface blocked_auth.
  await page.route("**/api/mail/v1/accounts/**/changes", fulfillBlockedAuth);
  await page.route(
    "**/api/mail/v1/accounts/**/enumeration",
    fulfillBlockedAuth,
  );
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
  const fulfillReconnect = async (route: {
    fulfill: (response: {
      status: number;
      contentType: string;
      json: { url: string };
    }) => Promise<unknown>;
  }) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { url: reconnectPath },
    });
  };
  await page.route("**/api/google/linking/auth-url**", fulfillReconnect);
  await page.route("**/api/outlook/linking/auth-url**", fulfillReconnect);
  await capturePlaywrightCheckpoint(page, testInfo, "mail-engine-blocked-auth");
  await page.getByRole("button", { name: "Reconnect" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${emailAccountId}/mail\\?reconnect=blocked`),
  );
});
