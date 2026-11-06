import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { test } from "../emulated/playwright-test";
import { getEmailAccountId } from "../emulated/account-test-helpers";
import { markAutomationOnboardingViewed } from "../emulated/automation/automation-tabs-test-helpers";

// Matches the bulk-run seed in server.mjs: more than the old 200-email trial cap.
const SEEDED_THREADS = 300;
const RULE_NAME = "Playwright bulk label";
// Labelling writes to Gmail like archiving does, but keeps threads in the inbox
// query the run is paging through.
const LABEL_NAME = "Bulk run";

type ProviderEvent = { method: string; reason: string | null };

test("bulk run waits out Gmail rate limits and processes every email once", async ({
  page,
}, testInfo) => {
  test.setTimeout(30 * 60_000);
  const emailAccountId = await getEmailAccountId(page);
  await prepareTrialAccountWithRule(emailAccountId);
  await scriptRuleChoice();
  await markAutomationOnboardingViewed(page);

  const dialog = await openBulkRunDialog(page, emailAccountId);
  await expect(
    dialog.getByText("Trials can process up to 2,000 past emails at a time."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Set start date" }).click();
  await page
    .getByRole("gridcell", { name: String(new Date().getDate()), exact: true })
    .first()
    .click();
  await page.keyboard.press("Escape");
  await expect(
    dialog.getByRole("button", { name: "Process Emails" }),
  ).toBeEnabled();

  // A per-user budget well below what the run needs, so Gmail starts rejecting
  // requests mid-run and recovers as the window rolls. The window is longer
  // than the server's own blocking retries (10s), so rejections reach the
  // client the way long Gmail "Retry after" times do.
  await configureQuota({
    userUnits: 1500,
    projectUnits: 1_200_000,
    windowMs: 30_000,
    concurrency: 4,
    latencyMs: 0,
    bytesPerSecond: 100_000_000,
  });
  await dialog.getByRole("button", { name: "Process Emails" }).click();

  const pausedNotice = dialog.getByRole("status").filter({
    hasText: "Your email provider is limiting requests",
  });
  await expect(pausedNotice).toBeVisible({ timeout: 5 * 60_000 });
  await testInfo.attach("bulk-run-paused", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  await expect(
    dialog.getByText(`Processed ${SEEDED_THREADS} emails`, { exact: true }),
  ).toBeVisible({ timeout: 25 * 60_000 });
  await expect(pausedNotice).toBeHidden();
  await testInfo.attach("bulk-run-finished", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  const { events } = await readLedger();
  const rejected = events.filter((event) => event.reason);
  testInfo.annotations.push({
    type: "gmail-rejections",
    description: JSON.stringify(countBy(rejected)),
  });
  expect(rejected.length).toBeGreaterThan(0);

  const executions = await getExecutionsPerThread(emailAccountId);
  expect(executions.size).toBe(SEEDED_THREADS);
  const results: Record<string, number> = {};
  for (const [threadId, { count, statuses }] of executions) {
    expect(count, `rule runs for ${threadId}`).toBe(1);
    for (const status of statuses) results[status] = (results[status] ?? 0) + 1;
  }
  // A Gmail rejection during the label write itself is recorded as an error on
  // the server, and is not redone when the email is retried.
  testInfo.annotations.push({
    type: "rule-results",
    description: JSON.stringify(results),
  });
  expect(results.APPLIED).toBeGreaterThan(0);
  expect(
    Object.keys(results).filter(
      (status) => status !== "APPLIED" && status !== "ERROR",
    ),
  ).toEqual([]);
});

async function openBulkRunDialog(page: Page, emailAccountId: string) {
  await page.goto(`/${emailAccountId}/automation`);
  const dialog = page.getByRole("dialog", { name: "Bulk Process Emails" });
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Process Past Emails" }).click();
    }
    await expect(dialog).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60_000 });
  return dialog;
}

async function prepareTrialAccountWithRule(emailAccountId: string) {
  const premiumId = `playwright_bulk_run_${process.env.PLAYWRIGHT_RUN_ID ?? "local"}`;
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO "Premium" (id, "createdAt", "updatedAt", "pendingInvites", tier, "stripeSubscriptionStatus")
       VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ARRAY[]::text[], 'BUSINESS_MONTHLY', 'trialing')
       ON CONFLICT (id) DO NOTHING`,
      [premiumId],
    );
    await client.query(
      `UPDATE "User" SET "premiumId" = $2, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = (SELECT "userId" FROM "EmailAccount" WHERE id = $1)`,
      [emailAccountId, premiumId],
    );
    // A Playwright retry reuses the mailbox, so clear the previous attempt's
    // results before counting this one's.
    await client.query(
      `DELETE FROM "ExecutedRule" WHERE "emailAccountId" = $1 AND "threadId" LIKE 'bulk_thread_%'`,
      [emailAccountId],
    );
    await client.query(
      `DELETE FROM "Rule" WHERE "emailAccountId" = $1 AND name = $2`,
      [emailAccountId, RULE_NAME],
    );
    const rule = await client.query<{ id: string }>(
      `INSERT INTO "Rule" (id, "createdAt", "updatedAt", name, "emailAccountId", instructions, enabled)
       VALUES (gen_random_uuid()::text, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, $1, 'Every email', true)
       RETURNING id`,
      [emailAccountId, RULE_NAME],
    );
    await client.query(
      `INSERT INTO "Action" (id, "createdAt", "updatedAt", type, "ruleId", "emailAccountId", label)
       VALUES (gen_random_uuid()::text, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'LABEL', $2, $1, $3)`,
      [emailAccountId, rule.rows[0].id, LABEL_NAME],
    );
  });
}

async function scriptRuleChoice() {
  const response = await fetch(
    `${process.env.PLAYWRIGHT_LLM_BASE_URL}/__emulator/replies`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        match: "Select a rule to apply to this email",
        object: {
          ruleName: RULE_NAME,
          reasoning: "Every email matches.",
          noMatchFound: false,
        },
      }),
    },
  );
  expect(response.ok).toBe(true);
}

async function getExecutionsPerThread(emailAccountId: string) {
  return withClient(async (client) => {
    const result = await client.query<{
      threadId: string;
      count: string;
      statuses: string[];
    }>(
      `SELECT "threadId", COUNT(*) AS count, ARRAY_AGG(status::text) AS statuses
       FROM "ExecutedRule"
       WHERE "emailAccountId" = $1 AND "threadId" LIKE 'bulk_thread_%'
       GROUP BY "threadId"`,
      [emailAccountId],
    );
    return new Map(
      result.rows.map(
        (row) =>
          [
            row.threadId,
            { count: Number(row.count), statuses: row.statuses },
          ] as const,
      ),
    );
  });
}

async function configureQuota(options: Record<string, number>) {
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

async function readLedger(): Promise<{ events: ProviderEvent[] }> {
  const response = await fetch(`${process.env.GOOGLE_BASE_URL}/__simulation`);
  if (!response.ok) throw new Error("Could not read simulation ledger");
  return response.json();
}

function countBy(events: ProviderEvent[]) {
  const counts: Record<string, number> = {};
  for (const event of events) {
    const key = `${event.method}:${event.reason}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function withClient<T>(callback: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}
