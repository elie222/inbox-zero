import { expect } from "@playwright/test";
import { INITIAL_MAIL_SPLITS } from "@/utils/split-inbox/initial-splits";
import { getEmailAccountId } from "../account-test-helpers";
import { test } from "../playwright-test";
import { measureInteraction, withCleanup } from "./latency-test-helpers";
import {
  conversationWithSubject,
  openMail,
  withClient,
} from "./mail-test-helpers";

const ROW = '[role="option"]';

test("archives a conversation without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const subject = "Archive Action Message";
  const row = conversationWithSubject(page, conversations, subject);
  await row
    .getByRole("checkbox", { name: /^Select conversation with/ })
    .click();

  await withCleanup(
    () =>
      measureInteraction({
        context,
        page,
        testInfo,
        interaction: "archive-conversation",
        start: { click: "button" },
        probes: [
          {
            name: "rowRemoved",
            kind: "noElement",
            selector: ROW,
            text: subject,
          },
        ],
        act: () =>
          page.getByRole("button", { name: "Archive", exact: true }).click(),
      }).then(() => {}),
    // Other specs share this mailbox, so put the conversation back.
    async () => {
      const undo = page
        .getByRole("region", { name: "Notifications alt+T" })
        .getByRole("button", { name: /^Undo/ });
      if (await undo.isVisible()) await undo.click();
      else await page.keyboard.press("z");
      await expect(row).toBeVisible();
    },
  );
});

test("marks a conversation unread without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const subject = "Collapsed Reader Message";
  const row = conversationWithSubject(page, conversations, subject);
  await row
    .getByRole("checkbox", { name: /^Select conversation with/ })
    .click();
  const markUnread = page.getByRole("button", { name: "Mark as unread" });
  await expect(markUnread).toBeVisible();

  await withCleanup(
    () =>
      measureInteraction({
        context,
        page,
        testInfo,
        interaction: "mark-unread",
        start: { click: "button" },
        probes: [
          {
            name: "rowShowsUnread",
            kind: "element",
            selector: `${ROW}:has(.font-semibold)`,
            text: subject,
          },
        ],
        act: () => markUnread.click(),
      }).then(() => {}),
    // Later cases rely on this conversation being read.
    async () => {
      const markRead = page.getByRole("button", { name: "Mark as read" });
      if (!(await markRead.isVisible()))
        await row
          .getByRole("checkbox", { name: /^Select conversation with/ })
          .click();
      await markRead.click();
      await expect(row.locator(".font-semibold")).toHaveCount(0);
    },
  );
});

test("labels a conversation without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Reader Navigation Message",
  ).click();
  await expect(
    page.getByRole("heading", { name: "Reader Navigation Message" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^More actions/ }).click();
  await page.getByRole("menuitem", { name: /^Label/ }).click();
  const picker = page.getByRole("dialog", { name: "Label conversations" });
  await picker.getByRole("combobox").fill("Project");
  const option = picker.getByRole("option", {
    name: "Project Alpha",
    exact: true,
  });
  await expect(option).toBeVisible();

  await measureInteraction({
    context,
    page,
    testInfo,
    interaction: "label-conversation",
    start: { click: ROW },
    probes: [
      {
        name: "labelOnConversation",
        kind: "element",
        selector: '[data-testid="thread-reader"] a',
        text: "Project Alpha",
      },
    ],
    act: () => option.click(),
  });
});

test("searches the mailbox without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  await openMail(page);
  const searchInput = page.getByPlaceholder("Search mail");
  await searchInput.fill("Reader Html");

  await measureInteraction({
    context,
    page,
    testInfo,
    interaction: "search",
    start: { key: "Enter" },
    probes: [
      {
        name: "matchShown",
        kind: "element",
        selector: ROW,
        text: "Reader Html Message",
      },
      {
        name: "nonMatchHidden",
        kind: "noElement",
        selector: ROW,
        text: "Keyboard Navigation Message",
      },
    ],
    act: () => searchInput.press("Enter"),
  });
});

test("moves to the next conversation without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Reader Navigation Message",
  ).click();
  // The reader double-buffers during a switch, so wait for one to settle.
  const reader = page.getByTestId("thread-reader");
  const settledOn = async (subject: string) => {
    await expect(reader).toHaveCount(1);
    await expect(reader).toContainText(subject);
  };
  await settledOn("Reader Navigation Message");
  // Learn which conversation is next, then return to start from a cold read.
  await page.keyboard.press("j");
  await expect(reader).toHaveCount(1);
  const next = reader.getByRole("heading").first();
  await expect(next).not.toHaveText("Reader Navigation Message");
  const nextSubject = (await next.textContent())?.trim() ?? "";
  expect(nextSubject).not.toBe("");
  await page.keyboard.press("k");
  await settledOn("Reader Navigation Message");

  await measureInteraction({
    context,
    page,
    testInfo,
    interaction: "next-conversation",
    start: { key: "j" },
    probes: [{ name: "nextShown", kind: "readerShows", subject: nextSubject }],
    act: () => page.keyboard.press("j"),
  });
});

test("switches split tabs without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  // New accounts get the default splits; add them only if they are missing,
  // and remove only what this test added.
  let seeded = false;
  await withCleanup(
    async () => {
      seeded = await seedInitialSplitsIfMissing(emailAccountId);
      const { conversations } = await openMail(page);
      const unreadTab = page.locator("button[data-split-tab]").filter({
        has: page.locator("[data-split-name]", { hasText: /^Unread$/ }),
      });
      await expect(unreadTab).toBeVisible({ timeout: 60_000 });
      // A read conversation shows under All and not under Unread.
      await expect(
        conversationWithSubject(
          page,
          conversations,
          "Collapsed Reader Message",
        ),
      ).toBeVisible();

      await measureInteraction({
        context,
        page,
        testInfo,
        interaction: "switch-split",
        start: { click: "button[data-split-tab]" },
        probes: [
          {
            name: "tabSelected",
            kind: "element",
            selector: 'button[data-split-tab][aria-current="true"]',
            text: "Unread",
          },
          {
            name: "readRowHidden",
            kind: "noElement",
            selector: ROW,
            text: "Collapsed Reader Message",
          },
        ],
        act: () => unreadTab.click(),
      });
    },
    async () => {
      if (!seeded) return;
      await withClient((client) =>
        client.query('DELETE FROM "MailSplit" WHERE "emailAccountId" = $1', [
          emailAccountId,
        ]),
      );
    },
  );
});

async function seedInitialSplitsIfMissing(emailAccountId: string) {
  return withClient(async (client) => {
    const existing = await client.query(
      'SELECT 1 FROM "MailSplit" WHERE "emailAccountId" = $1 LIMIT 1',
      [emailAccountId],
    );
    if (existing.rows.length) return false;
    for (const [order, split] of INITIAL_MAIL_SPLITS.entries()) {
      const { rows } = await client.query(
        `INSERT INTO "MailSplit" (id, "updatedAt", "emailAccountId", name, "matchAll", "order")
         VALUES (gen_random_uuid()::text, NOW(), $1, $2, true, $3) RETURNING id`,
        [emailAccountId, split.name, order],
      );
      const splitId = rows.at(0)?.id;
      if (!splitId) throw new Error("Could not initialize split fixture");
      for (const filter of split.filters.create) {
        await client.query(
          `INSERT INTO "MailSplitFilter" (id, "mailSplitId", kind, value, "order") VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`,
          [splitId, filter.kind, filter.value, filter.order],
        );
      }
    }
    return true;
  });
}
