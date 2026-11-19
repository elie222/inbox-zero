import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  conversationWithSubject,
  openMail,
  withClient,
} from "./mail-test-helpers";

const SENDER = "offers@example.com";
const SUBJECT = "Promotion Category Message";

test("shows an Unsubscribe button in the reader toolbar for a newsletter sender", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const rowId = `playwright_reader_unsubscribe_${emailAccountId}`;
  await withClient((client) =>
    client.query(
      `INSERT INTO "EmailMessage" (
         id, "createdAt", "updatedAt", "threadId", "messageId", date,
         "from", "fromName", "fromDomain", "to", "unsubscribeLink",
         read, sent, draft, inbox, "emailAccountId"
       )
       VALUES (
         $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, $2,
         CURRENT_TIMESTAMP - INTERVAL '1 day', $3, 'Offers', 'example.com',
         'playwright-recipient@example.com', 'https://example.com/unsubscribe',
         true, false, false, true, $4
       )
       ON CONFLICT (id) DO NOTHING`,
      [rowId, "playwright_reader_unsubscribe", SENDER, emailAccountId],
    ),
  );

  try {
    const promotions = page.getByRole("link", { name: /^Promotions/ });
    if (!(await promotions.isVisible())) {
      await page.getByRole("button", { name: "Categories" }).click();
    }
    await promotions.click();
    await conversationWithSubject(page, conversations, SUBJECT).click();

    const toolbar = page.getByRole("group", { name: "Thread actions" });
    await expect(
      toolbar.getByRole("button", { name: "Unsubscribe", exact: true }),
    ).toBeEnabled();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "mail-reader-unsubscribe-button",
    );

    await toolbar.getByRole("button", { name: /^More actions/ }).click();
    await expect(
      page.getByRole("menuitem", { name: "Unsubscribe ⇧U" }),
    ).toBeEnabled();
  } finally {
    await withClient((client) =>
      client.query(`DELETE FROM "EmailMessage" WHERE id = $1`, [rowId]),
    );
  }
});
