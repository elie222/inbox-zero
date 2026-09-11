import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  cleanupAutomationHistory,
  expectVisibleAfterTransientFetch,
  HISTORY_RULE_ID,
  HISTORY_RULE_NAME,
  markAutomationOnboardingViewed,
  seedAutomationHistory,
  seedAutomationThreadHistory,
} from "./automation-tabs-test-helpers";

test.afterEach(async () => {
  await cleanupAutomationHistory();
});

test("shows persisted execution history and preserves rule filters", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  await seedAutomationHistory(emailAccountId);
  await markAutomationOnboardingViewed(page);

  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get(
            "/api/user/executed-rules/history?page=1&ruleId=all",
            { headers: { "X-Email-Account-ID": emailAccountId } },
          );
          if (!response.ok()) return [];

          const historyData = (await response.json()) as {
            results: Array<{ messageId: string }>;
          };
          return historyData.results.map((result) => result.messageId);
        } catch {
          return [];
        }
      },
      { timeout: 60_000 },
    )
    .toContain("msg_playwright_1");

  await page.goto(`/${emailAccountId}/automation?tab=history`);
  await expect(
    page.getByRole("button", { name: "History", exact: true }),
  ).toHaveAttribute("data-selected", "true");
  await expectVisibleAfterTransientFetch(
    page,
    page.getByText(HISTORY_RULE_NAME, { exact: true }),
  );
  await expect(
    page.getByText("Applied manually", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "All rules" }).click();
  await page.getByRole("menuitem", { name: HISTORY_RULE_NAME }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("ruleId") === HISTORY_RULE_ID,
  );
  await page.reload();
  await expectVisibleAfterTransientFetch(
    page,
    page.getByRole("button", { name: HISTORY_RULE_NAME }),
  );
  await expect(
    page.getByText("Applied manually", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: HISTORY_RULE_NAME }).click();
  await page.getByRole("menuitem", { name: "No match" }).click();
  await expect(page.getByText("No history", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByText("No emails have been processed for this rule.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("groups conversations and lazily pages older messages without duplicating the latest", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await seedAutomationThreadHistory(emailAccountId);
  await markAutomationOnboardingViewed(page);
  const headers = { "X-Email-Account-ID": emailAccountId };
  const historyUrl = "/api/user/executed-rules/history";
  const summaryResponse = await page.request.get(
    `${historyUrl}?ruleId=${HISTORY_RULE_ID}`,
    { headers },
  );
  expect(summaryResponse.ok()).toBe(true);
  const summary = await summaryResponse.json();
  expect(summary.totalPages).toBe(1);
  expect(summary.results).toHaveLength(1);
  expect(summary.results[0]).toMatchObject({
    messageId: "msg_playwright_1",
    messageCount: 52,
  });
  expect(summary.results[0].executedRules).toHaveLength(2);

  const detailsUrl = `${historyUrl}?ruleId=${HISTORY_RULE_ID}&threadId=thr_playwright_1&excludeMessageId=msg_playwright_1`;
  const firstPage = await (
    await page.request.get(detailsUrl, { headers })
  ).json();
  const secondPage = await (
    await page.request.get(`${detailsUrl}&page=2`, { headers })
  ).json();
  expect(firstPage.totalPages).toBe(2);
  expect(firstPage.results).toHaveLength(50);
  expect(secondPage.results).toHaveLength(1);
  expect(
    new Set(
      [...firstPage.results, ...secondPage.results].map(
        (result) => result.messageId,
      ),
    ).size,
  ).toBe(51);
  const unknownThread = await (
    await page.request.get(`${historyUrl}?threadId=unknown`, { headers })
  ).json();
  expect(unknownThread.results).toEqual([]);
  const skipped = await (
    await page.request.get(
      `${historyUrl}?threadId=thr_playwright_1&ruleId=skipped`,
      { headers },
    )
  ).json();
  expect(skipped.results).toEqual([]);

  // Synthetic historical messages need not still exist in the mailbox.
  await page.route("**/api/messages/batch?*", async (route) => {
    const ids =
      new URL(route.request().url()).searchParams.get("ids")?.split(",") ?? [];
    if (ids.every((id) => id.startsWith("history-message-"))) {
      await route.fulfill({ json: { messages: [] } });
    } else {
      await route.continue();
    }
  });
  const detailRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes(historyUrl) &&
      new URL(request.url()).searchParams.has("threadId")
    )
      detailRequests.push(request.url());
  });
  await page.goto(
    `/${emailAccountId}/automation?tab=history&ruleId=${HISTORY_RULE_ID}`,
  );
  await expect(page.getByText("52 messages handled")).toBeVisible();
  expect(detailRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Expand conversation" }).click();
  await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Email unavailable", { exact: true }),
  ).toHaveCount(50);
  await expect(page.getByText("Applied manually", { exact: true })).toHaveCount(
    1,
  );
  await page.screenshot({
    path: testInfo.outputPath("history-expanded.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Next messages", exact: true })
    .click();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Email unavailable", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Next messages", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Collapse conversation" }).click();
  await expect(
    page.getByText("Email unavailable", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("history-collapsed.png"),
    fullPage: true,
  });
});

test("paginates whole conversations with stable ordering for tied dates", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  await seedAutomationThreadHistory(emailAccountId, 50);
  const headers = { "X-Email-Account-ID": emailAccountId };
  const url = `/api/user/executed-rules/history?ruleId=${HISTORY_RULE_ID}`;
  const first = await (
    await page.request.get(`${url}&page=1`, { headers })
  ).json();
  const second = await (
    await page.request.get(`${url}&page=2`, { headers })
  ).json();
  expect(first.totalPages).toBe(2);
  expect(first.results).toHaveLength(50);
  expect(second.results).toHaveLength(1);
  expect(first.results[0]).toMatchObject({
    threadId: "thr_playwright_1",
    messageCount: 52,
  });
  expect(
    new Set(
      [...first.results, ...second.results].map((result) => result.threadId),
    ).size,
  ).toBe(51);
  const repeated = await (
    await page.request.get(`${url}&page=1`, { headers })
  ).json();
  expect(
    repeated.results.map((result: { threadId: string }) => result.threadId),
  ).toEqual(
    first.results.map((result: { threadId: string }) => result.threadId),
  );
  const empty = await (
    await page.request.get(`${url}&page=3`, { headers })
  ).json();
  expect(empty.results).toEqual([]);
  expect(empty.totalPages).toBe(2);
  const invalid = await (
    await page.request.get(`${url}&page=invalid`, { headers })
  ).json();
  expect(invalid.results).toEqual(first.results);
  await seedAutomationThreadHistory(emailAccountId, 0, 50);
  const olderMessages = await (
    await page.request.get(
      `${url}&threadId=thr_playwright_1&excludeMessageId=msg_playwright_1`,
      { headers },
    )
  ).json();
  expect(olderMessages.totalPages).toBe(1);
  expect(olderMessages.results).toHaveLength(50);
  expect(
    olderMessages.results.map(
      (result: { messageId: string }) => result.messageId,
    ),
  ).not.toContain("msg_playwright_1");
});
