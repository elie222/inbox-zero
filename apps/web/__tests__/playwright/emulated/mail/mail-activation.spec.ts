import { expect } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "./account-test-helpers";
import { withClient } from "./mail-test-helpers";

test("starts downloads only after visiting Mail and resumes the activated account after reload", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const secondAccount = await createSecondEmailAccount(emailAccountId);
  const syncAccountIds = new Set<string>();

  await page.route("**/api/mobile/mailbox-sync", async (route) => {
    const accountId = await route.request().headerValue("X-Email-Account-ID");
    if (accountId) syncAccountIds.add(accountId);
    await route.fulfill({
      json: {
        accountId,
        cursor: `${accountId}-cursor`,
        deletedMessageIds: [],
        hasMore: false,
        reset: false,
        upsertedMessages: [],
      },
    });
  });

  try {
    await page.goto(`/${emailAccountId}/assistant`);
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
    });
    // Give mounted background effects time to expose unintended downloads.
    await page.waitForTimeout(1500);
    expect([...syncAccountIds]).toEqual([]);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "assistant-without-mail-downloads",
    );

    await page.goto(`/${emailAccountId}/mail`);
    await expect(
      page.getByRole("combobox", { name: "Search mail" }),
    ).toBeVisible();
    await expect.poll(() => [...syncAccountIds]).toEqual([emailAccountId]);
    await capturePlaywrightCheckpoint(page, testInfo, "mail-activated");

    syncAccountIds.clear();
    await page.goto(`/${emailAccountId}/assistant`);
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (id) => localStorage.getItem(`inbox-zero:mail-activation:${id}`),
          emailAccountId,
        ),
      )
      .toBe("1");
    syncAccountIds.clear();
    await page.reload();
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (id) => localStorage.getItem(`inbox-zero:mail-activation:${id}`),
          emailAccountId,
        ),
      )
      .toBe("1");
    expect([...syncAccountIds].every((id) => id === emailAccountId)).toBe(true);

    await withClient((client) =>
      client.query(
        'UPDATE "EmailAccount" SET "includeInAllAccounts" = false WHERE id = $1',
        [secondAccount.id],
      ),
    );
    await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    await expect(
      page.getByRole("combobox", { name: "Search mail" }),
    ).toBeVisible();
    expect(syncAccountIds.has(secondAccount.id)).toBe(false);

    await withClient((client) =>
      client.query(
        'UPDATE "EmailAccount" SET "includeInAllAccounts" = true WHERE id = $1',
        [secondAccount.id],
      ),
    );
    await page.reload();
    await expect.poll(() => syncAccountIds.has(secondAccount.id)).toBe(true);
    await capturePlaywrightCheckpoint(page, testInfo, "unified-mail-activated");
  } finally {
    await deleteSecondEmailAccount(secondAccount.accountId);
  }
});
