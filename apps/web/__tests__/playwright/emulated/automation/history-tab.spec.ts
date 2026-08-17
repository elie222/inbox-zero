import { expect, test } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  cleanupAutomationHistory,
  expectVisibleAfterTransientFetch,
  HISTORY_RULE_ID,
  HISTORY_RULE_NAME,
  markAutomationOnboardingViewed,
  seedAutomationHistory,
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
