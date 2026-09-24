import { expect } from "@playwright/test";
import type { Client } from "pg";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { playwrightMailProvider } from "../mail-provider";
import { openMail, withClient } from "./mail-test-helpers";

const THREAD_ID = "thr_playwright_matched_reason";
const EARLIER_MESSAGE_ID = "msg_playwright_matched_earlier";
const LATER_MESSAGE_ID = "msg_playwright_matched_later";
const RULE_ID = "playwright-mail-matched-reason-rule";
const EARLIER_EXECUTION_ID = "playwright-mail-matched-earlier";
const LATER_EXECUTION_ID = "playwright-mail-matched-later";

test("shows matched reasons only for the selected message", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await seedMatchedReasons(emailAccountId);
  try {
    await page.goto(`/${emailAccountId}/mail?thread-id=${THREAD_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Matched Reason Message" }),
    ).toBeVisible({ timeout: 60_000 });
    const expand = page.getByRole("button", {
      name: "Expand all messages",
      exact: true,
    });
    if (await expand.isVisible()) await expand.click();

    for (const [id, reason, otherReason] of [
      [
        EARLIER_MESSAGE_ID,
        "Reason for the earlier message.",
        "Reason for the later message.",
      ],
      [
        LATER_MESSAGE_ID,
        "Reason for the later message.",
        "Reason for the earlier message.",
      ],
    ]) {
      const message = page.locator(`[data-thread-message-id="${id}"]`);
      await message.hover();
      await expect(
        message.getByRole("button", { name: "Reply", exact: true }),
      ).toBeVisible();
      await expect(
        message.getByRole("button", { name: "Forward", exact: true }),
      ).toBeVisible();
      await message
        .getByRole("button", { name: "More message actions", exact: true })
        .click();
      await page.getByRole("menuitem", { name: "Matched reason" }).click();
      await expect(page.getByText(reason, { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        page.getByText(otherReason, { exact: true }),
      ).not.toBeVisible();
      await expect(
        page.getByText(
          playwrightMailProvider === "microsoft"
            ? "Categorize as 'Needs response'"
            : "Label as 'Needs response'",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByText("Draft Reply", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(
          id === EARLIER_MESSAGE_ID ? "Actions applied" : "Rule actions",
          { exact: true },
        ),
      ).toBeVisible();
      if (id === LATER_MESSAGE_ID) {
        await expect(
          page.getByText("The integration action could not be completed.", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByText("Actions applied", { exact: true }),
        ).not.toBeVisible();
      }
      await capturePlaywrightCheckpoint(page, testInfo, `matched-reason-${id}`);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
    }
  } finally {
    await cleanupMatchedReasons();
  }
});

async function seedMatchedReasons(emailAccountId: string) {
  await withClient(async (client) => {
    await deleteMatchedReasons(client);
    await client.query(
      `INSERT INTO "Rule"
         (id, name, enabled, automate, "runOnThreads", instructions,
          "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, $2, true, true, false, $3, $4,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [RULE_ID, "Example rule", "Match these seeded messages", emailAccountId],
    );
    await insertMatchedExecution(client, {
      id: EARLIER_EXECUTION_ID,
      messageId: EARLIER_MESSAGE_ID,
      emailAccountId,
      reason: "Reason for the earlier message.",
    });
    await insertMatchedExecution(client, {
      id: LATER_EXECUTION_ID,
      messageId: LATER_MESSAGE_ID,
      emailAccountId,
      reason:
        "Reason for the later message.\nAction failures: INTEGRATION:INTEGRATION_CALL_FAILED",
    });
  });
}

async function insertMatchedExecution(
  client: Client,
  {
    id,
    messageId,
    emailAccountId,
    reason,
  }: {
    id: string;
    messageId: string;
    emailAccountId: string;
    reason: string;
  },
) {
  await client.query(
    `INSERT INTO "ExecutedRule"
       (id, "threadId", "messageId", status, automated, reason, "ruleId",
        "emailAccountId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'APPLIED', true, $4, $5, $6,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, THREAD_ID, messageId, reason, RULE_ID, emailAccountId],
  );
  await client.query(
    `INSERT INTO "ExecutedAction"
       (id, type, label, "executionStatus", "executedAt", "executedRuleId",
        "createdAt", "updatedAt")
     VALUES
       ($1, 'LABEL', 'Needs response', 'SUCCEEDED', CURRENT_TIMESTAMP, $4,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ($2, 'DRAFT_EMAIL', NULL, 'SUCCEEDED', CURRENT_TIMESTAMP, $4,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ($3, 'INTEGRATION', NULL, 'SUCCEEDED', CURRENT_TIMESTAMP, $4,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [`${id}-label`, `${id}-draft`, `${id}-integration`, id],
  );
}

async function cleanupMatchedReasons() {
  await withClient(deleteMatchedReasons);
}

async function deleteMatchedReasons(client: Client) {
  await client.query(
    `DELETE FROM "ExecutedRule" WHERE id = ANY($1) OR "ruleId" = $2`,
    [[EARLIER_EXECUTION_ID, LATER_EXECUTION_ID], RULE_ID],
  );
  await client.query(`DELETE FROM "Rule" WHERE id = $1`, [RULE_ID]);
}
