import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  conversationWithSubject,
  openMail,
  readLatestMailMutation,
} from "./mail-test-helpers";

const THREAD_ID = "thr_playwright_archive";
const SUBJECT = "Archive Action Message";

test("keeps an archived conversation hidden through engine reconciliation", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(page, conversations, SUBJECT);
  await expect(conversation).toHaveCount(1);

  const cleanupErrors: unknown[] = [];
  try {
    await conversation.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(conversation).toHaveCount(0);
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "archive",
          threadId: THREAD_ID,
        }),
      )
      .toMatchObject({
        status: expect.stringMatching(/^(reconciling|succeeded)$/),
      });
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "archive-awaiting-final-page",
    );

    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "archive",
          threadId: THREAD_ID,
        }),
      )
      .toMatchObject({ status: "succeeded" });
    await expect(conversation).toHaveCount(0);
    await capturePlaywrightCheckpoint(page, testInfo, "archive-reconciled");
  } finally {
    await page.request
      .post(`/api/threads/${THREAD_ID}/unarchive`, {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
    for (const error of cleanupErrors) {
      testInfo.annotations.push({
        type: "cleanup-error",
        description: String(error),
      });
    }
  }
  expect(cleanupErrors).toEqual([]);
});
