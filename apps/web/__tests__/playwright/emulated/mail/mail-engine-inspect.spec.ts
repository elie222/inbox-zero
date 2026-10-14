import { expect, type Page, type Route } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "./account-test-helpers";
import { openMail } from "./mail-test-helpers";

test("releases storage on page departure and restarts after a cached-page restore", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const workers = { started: 0, terminated: 0 };
    Object.assign(window, { __testMailWorkers: workers });
    window.Worker = class extends OriginalWorker {
      postMessage(...args: Parameters<Worker["postMessage"]>) {
        if (args[0]?.type === "start") workers.started++;
        super.postMessage(...args);
      }
      terminate() {
        workers.terminated++;
        super.terminate();
      }
    };
  });
  const workers = () =>
    page.evaluate(
      () =>
        (
          window as Window & {
            __testMailWorkers: { started: number; terminated: number };
          }
        ).__testMailWorkers,
    );
  const { conversations } = await openMail(page);
  await expect(conversations.getByRole("option").first()).toBeVisible({
    timeout: 60_000,
  });
  const before = await workers();

  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  await expect
    .poll(async () => (await workers()).terminated)
    .toBeGreaterThan(before.terminated);

  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect
    .poll(async () => (await workers()).started)
    .toBeGreaterThan(before.started);
  await expect(conversations.getByRole("option").first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByText("Mail could not start. Please try again.", { exact: true }),
  ).toBeHidden();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-engine-page-restored",
  );
});

test("recovers from a transient storage lock during startup", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    let failFirstStart = true;
    window.Worker = class extends OriginalWorker {
      postMessage(...args: Parameters<Worker["postMessage"]>) {
        const message = args[0];
        if (message?.type === "start" && failFirstStart) {
          failFirstStart = false;
          queueMicrotask(() =>
            this.dispatchEvent(
              new MessageEvent("message", {
                data: {
                  id: message.id,
                  type: "error",
                  errorName: "UnknownError",
                  message: "Previous storage handle is still closing",
                },
              }),
            ),
          );
          return;
        }
        super.postMessage(...args);
      }
    };
  });
  const { conversations } = await openMail(page);
  await expect(conversations.getByRole("option").first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByText("Mail could not start. Please try again.", { exact: true }),
  ).toBeHidden();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-engine-storage-lock-recovered",
  );
});

test("waits for account metadata and switches accounts without storage errors", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const starts: string[] = [];
    Object.assign(window, { __testMailStarts: starts });
    window.Worker = class extends OriginalWorker {
      postMessage(...args: Parameters<Worker["postMessage"]>) {
        if (args[0]?.type === "start") {
          starts.push(args[0].input.accountId);
        }
        super.postMessage(...args);
      }
    };
  });
  await page.route("**/api/user/email-accounts", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  const { emailAccountId } = await openMail(page);
  const second = await createSecondEmailAccount(emailAccountId);
  try {
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => window.__inboxZeroMailInspect?.role))
      .toBe("owner");
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __testMailStarts: string[] }).__testMailStarts,
      ),
    ).toEqual([emailAccountId]);
    await page
      .getByRole("button", { name: /playwright-test\+/i })
      .last()
      .click();
    await page.getByRole("menuitem", { name: new RegExp(second.name) }).click();
    await expect
      .poll(
        () => page.evaluate(() => window.__inboxZeroMailInspect?.accountId),
        { timeout: 60_000 },
      )
      .toBe(second.id);
    await expect(
      page
        .getByRole("listbox", { name: "Conversations" })
        .getByRole("option")
        .first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText("Mail needs persistent browser storage.", { exact: true }),
    ).toBeHidden();
    await expect(
      page.getByText("Mail could not start. Please try again.", {
        exact: true,
      }),
    ).toBeHidden();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "account-switch-after-storage-close",
    );
  } finally {
    await page.goto("about:blank");
    await deleteSecondEmailAccount(second.accountId);
  }
});

test("exposes engine diagnostics after metadata coverage", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  await expect(conversations.getByRole("option").first()).toBeVisible({
    timeout: 60_000,
  });
  await waitForMetadataCoverage(page);
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
  await waitForMetadataCoverage(page);

  let changeRequests = 0;
  let enumerationRequests = 0;
  const fulfillBlockedAuth = async (route: Route) => {
    changeRequests += 1;
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
  await page.route("**/api/mail/v1/accounts/**/changes", fulfillBlockedAuth);
  await page.route(
    "**/api/mail/v1/accounts/**/changes/batch",
    fulfillBlockedAuth,
  );
  await page.route("**/api/mail/v1/accounts/**/enumeration", async (route) => {
    enumerationRequests += 1;
    await route.continue();
  });
  await expect(
    page.getByRole("heading", {
      name: "Reconnect this account to continue syncing.",
    }),
  ).toBeVisible({ timeout: 60_000 });
  expect(changeRequests).toBeGreaterThan(0);
  expect(enumerationRequests).toBe(0);
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

test("serves two accounts through one owner and takes over when that owner leaves", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  await waitForMetadataCoverage(page);
  await expect
    .poll(() => page.evaluate(() => window.__inboxZeroMailInspect?.role))
    .toBe("owner");
  const secondAccount = await createSecondEmailAccount(emailAccountId);
  const other = await page.context().newPage();
  const errors: string[] = [];
  other.on("pageerror", (error) => errors.push(error.message));
  for (const tab of [page, other]) {
    tab.on("console", (message) => {
      if (
        message.type() === "error" &&
        /Maximum update depth|result of getSnapshot should be cached/.test(
          message.text(),
        )
      ) {
        errors.push(message.text());
      }
    });
  }
  try {
    await other.goto(`/${secondAccount.id}/mail`, {
      waitUntil: "domcontentloaded",
    });
    await expect
      .poll(
        () =>
          other.evaluate(() => ({
            role: window.__inboxZeroMailInspect?.role,
            accountId: window.__inboxZeroMailInspect?.accountId,
          })),
        { timeout: 60_000 },
      )
      .toEqual({ role: "follower", accountId: secondAccount.id });
    await expect(
      other
        .getByRole("listbox", { name: "Conversations" })
        .getByRole("option")
        .first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(conversations.getByRole("option").first()).toBeVisible();
    const diagnostics = await other.evaluate(async () =>
      window.__inboxZeroMailInspect?.read(),
    );
    expect(diagnostics).toMatchObject({ accountId: secondAccount.id });
    await capturePlaywrightCheckpoint(
      other,
      testInfo,
      "mail-engine-second-account-follower",
    );

    await page.goto("about:blank");
    await expect
      .poll(() => other.evaluate(() => window.__inboxZeroMailInspect?.role), {
        timeout: 60_000,
      })
      .toBe("owner");
    await page.goto(`/${emailAccountId}/mail`, {
      waitUntil: "domcontentloaded",
    });
    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            role: window.__inboxZeroMailInspect?.role,
            accountId: window.__inboxZeroMailInspect?.accountId,
          })),
        { timeout: 60_000 },
      )
      .toEqual({ role: "follower", accountId: emailAccountId });
    await expect(conversations.getByRole("option").first()).toBeVisible({
      timeout: 60_000,
    });
    await capturePlaywrightCheckpoint(
      other,
      testInfo,
      "mail-engine-second-account-takeover",
    );
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank");
    await other.close();
    await deleteSecondEmailAccount(secondAccount.accountId);
  }
});

test("joins two different accounts when both tabs start together", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const secondAccount = await createSecondEmailAccount(emailAccountId);
  const other = await page.context().newPage();
  const errors: string[] = [];
  for (const tab of [page, other]) {
    tab.on("pageerror", (error) => errors.push(error.message));
  }
  try {
    await Promise.all([
      page.goto(`/${emailAccountId}/mail`, { waitUntil: "domcontentloaded" }),
      other.goto(`/${secondAccount.id}/mail`, {
        waitUntil: "domcontentloaded",
      }),
    ]);
    await expect
      .poll(
        async () => {
          const roles = await Promise.all(
            [page, other].map((tab) =>
              tab.evaluate(() => window.__inboxZeroMailInspect?.role),
            ),
          );
          return roles.sort();
        },
        { timeout: 60_000 },
      )
      .toEqual(["follower", "owner"]);
    for (const [tab, accountId] of [
      [page, emailAccountId],
      [other, secondAccount.id],
    ] as const) {
      expect(
        await tab.evaluate(() => window.__inboxZeroMailInspect?.accountId),
      ).toBe(accountId);
      await expect(
        tab
          .getByRole("listbox", { name: "Conversations" })
          .getByRole("option")
          .first(),
      ).toBeVisible({ timeout: 60_000 });
    }
    await capturePlaywrightCheckpoint(
      other,
      testInfo,
      "mail-engine-simultaneous-accounts",
    );
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank");
    await other.close();
    await deleteSecondEmailAccount(secondAccount.accountId);
  }
});

async function waitForMetadataCoverage(page: Page) {
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
}
