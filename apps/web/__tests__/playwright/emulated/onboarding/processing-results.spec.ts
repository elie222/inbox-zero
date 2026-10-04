import { expect, test } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";

for (const state of ["loading", "empty", "completed", "error"] as const) {
  test(`processing results reports ${state} honestly`, async ({
    page,
  }, testInfo) => {
    const accountId = await getEmailAccountId(page);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/api/user/onboarding/processed-emails",
      async (route) => {
        if (state === "loading") await gate;
        await route.fulfill({
          status: state === "error" ? 503 : 200,
          json:
            state === "completed"
              ? {
                  totalCount: 1,
                  draftCount: 1,
                  emails: [
                    {
                      messageId: "fixture-result",
                      systemType: "RECEIPT",
                      label: "Receipts",
                      sender: "Fixture Sender",
                      subject: "Safety receipt",
                      date: new Date().toISOString(),
                      hasDraft: true,
                    },
                  ],
                }
              : { totalCount: 0, draftCount: 0, emails: [] },
        });
      },
    );
    try {
      await page.goto(
        `/${accountId}/onboarding?step=inboxProcessed&force=true`,
      );
      await expect(
        page.getByRole("heading", { name: "Inbox processing results" }),
      ).toBeVisible();
      if (state === "loading") {
        await expect(page.getByRole("status")).toContainText(
          "Checking for completed email processing",
        );
        await expect(
          page.getByRole("region", {
            name: "Loading recently organized emails",
          }),
        ).toBeVisible();
      } else if (state === "empty") {
        await expect(page.getByRole("status")).toContainText(
          "No completed email processing was found",
        );
        await expect(
          page.getByText("Completed results will appear here."),
        ).toBeVisible();
      } else if (state === "error") {
        await expect(
          page
            .getByRole("alert")
            .filter({ hasText: "couldn't load your processing results" }),
        ).toContainText("couldn't load your processing results");
        await expect(
          page.getByRole("region", { name: "Recently organized emails" }),
        ).toHaveCount(0);
      } else {
        await expect(page.getByRole("status")).toContainText(
          "Applied rules to 1 recent conversation",
        );
        await expect(page.getByRole("status")).toContainText(
          "1 includes a draft reply",
        );
        await expect(
          page.getByRole("region", { name: "Recently organized emails" }),
        ).toContainText("Safety receipt");
      }
      await capturePlaywrightCheckpoint(
        page,
        testInfo,
        `processing-results-${state}`,
      );
      await expect(
        page.getByRole("button", { name: "Continue", exact: true }),
      ).toBeEnabled();
    } finally {
      release();
    }
  });
}
