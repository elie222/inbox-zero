import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  cleanUpFixture,
  type CleanupFixture,
  openCleanupFeature,
  prepareCleanupFixture,
} from "./cleanup-test-helpers";

const MESSAGE_PREFIX = "playwright_pile_";

// Every thread exists in the mail emulator, so moving it is a real provider call.
const PILE = [
  { threadId: "thr_playwright_pile_1", name: "Casino Bonus Hub", emails: 2 },
  { threadId: "thr_playwright_pile_2", name: "Casino Bonus Hub", emails: 1 },
  {
    threadId: "thr_playwright_pile_3",
    name: "Norton Renewal Center",
    emails: 1,
  },
  { threadId: "thr_playwright_pile_4", name: "MyChart Free Gift", emails: 1 },
];
const REPLIED_THREAD_ID = "thr_playwright_pile_replied";

let fixture: CleanupFixture | undefined;

test.beforeEach(async ({ page }) => {
  fixture = undefined;
  fixture = await prepareCleanupFixture(page);
  await seedPile(fixture.emailAccountId);
});

test.afterEach(async () => {
  if (!fixture) return;
  await deletePile(fixture.emailAccountId);
  await cleanUpFixture(fixture);
});

test("shows mail with no sender address as one reviewable row", async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000);
  const row = await openPileRow(page);

  await expect(row).toContainText("3 different names");
  await expect(row.getByRole("cell").nth(2)).toHaveText("5");
  await expect(row.getByRole("button", { name: "Move to Junk" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Unsubscribe" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Keep" })).toHaveCount(0);
  await expect(row.getByRole("checkbox")).toHaveCount(0);

  await row.getByRole("button", { name: "Toggle menu" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Archive All"]);
  await page.keyboard.press("Escape");

  await capturePlaywrightCheckpoint(page, testInfo, "pile-row");
});

test("moves only the ticked names to Junk and undoes it", async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000);
  const row = await openPileRow(page);

  await row.getByRole("button", { name: "Move to Junk" }).click();
  const dialog = page.getByRole("dialog", { name: "Move to Junk" });
  await expect(dialog).toBeVisible();

  const names = [
    "Casino Bonus Hub",
    "Norton Renewal Center",
    "MyChart Free Gift",
  ];
  for (const name of names) {
    await expect(
      dialog.getByRole("checkbox", { name: `Include ${name}` }),
    ).toHaveAttribute("aria-checked", "true");
  }
  // A thread the user replied in never joins the pile.
  await expect(dialog.getByText("Gift Card Desk")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Move 5 Emails to Junk" }),
  ).toBeVisible();

  await dialog
    .getByRole("checkbox", { name: "Include Norton Renewal Center" })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Move 4 Emails to Junk" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "pile-dialog-unticked");

  await dialog.getByRole("button", { name: "Move 4 Emails to Junk" }).click();
  const toast = page.getByText("Moved 4 emails to Junk");
  await expect(toast).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "pile-toast");

  // Moved threads leave the sender list; the unticked name and the replied thread stay.
  await expectPileThreads(
    ["thr_playwright_pile_3", REPLIED_THREAD_ID],
    ["thr_playwright_pile_1", "thr_playwright_pile_2", "thr_playwright_pile_4"],
  );

  // The row now counts only what is left.
  await expect(row).toContainText("1 different name", { timeout: 60_000 });

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Moved 4 emails back to your inbox")).toBeVisible(
    {
      timeout: 120_000,
    },
  );
});

test("archives from the menu after the same review and can undo", async ({
  page,
}) => {
  test.setTimeout(360_000);
  const row = await openPileRow(page);

  await row.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("menuitem", { name: "Archive All" }).click();
  const dialog = page.getByRole("dialog", { name: "Archive All" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("checkbox", { name: "Include MyChart Free Gift" })
    .click();
  await dialog.getByRole("button", { name: "Archive 4 Emails" }).click();

  await expect(page.getByText("Archived 4 emails")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Moved 4 emails back to your inbox")).toBeVisible(
    { timeout: 120_000 },
  );
});

test("keeps a long list of names inside the dialog", async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000);
  if (!fixture) throw new Error("Cleanup fixture was not initialized");
  await seedManyNames(fixture.emailAccountId, 95);
  const row = await openPileRow(page);

  await row.getByRole("button", { name: "Move to Junk" }).click();
  const dialog = page.getByRole("dialog", { name: "Move to Junk" });
  await expect(
    dialog.getByRole("checkbox", { name: "Include Spoof Name 094" }),
  ).toBeAttached();
  await dialog
    .getByRole("checkbox", { name: "Include Spoof Name 000" })
    .click();

  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("Dialog was not laid out");
  expect(box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.width).toBeLessThanOrEqual(viewport.width);
  await expect(
    dialog.getByRole("button", { name: /^Move \d+ Emails to Junk$/ }),
  ).toBeInViewport();
  await dialog.locator("ul").evaluate((list) => {
    list.scrollTop = 0;
  });
  await capturePlaywrightCheckpoint(page, testInfo, "pile-dialog-long-list");
});

for (const { label, width, height, colorScheme } of [
  { label: "desktop-light", width: 1280, height: 800, colorScheme: "light" },
  { label: "desktop-dark", width: 1280, height: 800, colorScheme: "dark" },
  { label: "phone-light", width: 390, height: 844, colorScheme: "light" },
  { label: "phone-dark", width: 390, height: 844, colorScheme: "dark" },
] as const) {
  test.describe(label, () => {
    test.use({ viewport: { width, height }, colorScheme });

    test(`pile row, review dialog and toast look right (${label})`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(360_000);
      if (!fixture) throw new Error("Cleanup fixture was not initialized");
      await seedManyNames(fixture.emailAccountId, 95);
      const row = await openPileRow(page);
      await capturePlaywrightCheckpoint(page, testInfo, `${label}-row`);

      await row.getByRole("button", { name: "Move to Junk" }).click();
      const dialog = page.getByRole("dialog", { name: "Move to Junk" });
      await dialog
        .getByRole("checkbox", { name: "Include Norton Renewal Center" })
        .click();
      await dialog.locator("ul").evaluate((list) => {
        list.scrollTop = 0;
      });
      await capturePlaywrightCheckpoint(page, testInfo, `${label}-dialog`);

      await dialog
        .getByRole("button", { name: /^Move \d+ Emails to Junk$/ })
        .click();
      await expect(page.getByText(/^Moved \d+ emails to Junk$/)).toBeVisible({
        timeout: 120_000,
      });
      await capturePlaywrightCheckpoint(page, testInfo, `${label}-toast`);
    });
  });
}

async function openPileRow(page: Page) {
  if (!fixture) throw new Error("Cleanup fixture was not initialized");
  await openCleanupFeature(page, fixture, "bulk-unsubscribe");
  const row = page.getByRole("row").filter({ hasText: "No sender address" });
  await expect(row).toBeVisible({ timeout: 120_000 });
  return row;
}

// The mail emulator stops serving a thread once it is in Junk, so the app's own
// stats table is what shows which threads were moved.
async function expectPileThreads(present: string[], absent: string[]) {
  if (!fixture) throw new Error("Cleanup fixture was not initialized");
  const emailAccountId = fixture.emailAccountId;
  await expect
    .poll(async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      try {
        const { rows } = await client.query<{ threadId: string }>(
          `SELECT DISTINCT "threadId" FROM "EmailMessage"
           WHERE "emailAccountId" = $1 AND "from" = '' AND "messageId" LIKE $2`,
          [emailAccountId, `${MESSAGE_PREFIX}%`],
        );
        const threads = new Set(rows.map((row) => row.threadId));
        return {
          present: present.filter((id) => threads.has(id)),
          absent: absent.filter((id) => !threads.has(id)),
        };
      } finally {
        await client.end();
      }
    })
    .toEqual({ present, absent });
}

async function seedPile(emailAccountId: string) {
  await deletePile(emailAccountId);
  const rows: PileRow[] = [];
  for (const { threadId, name, emails } of PILE) {
    for (let index = 0; index < emails; index++) {
      rows.push({
        threadId,
        messageId: `${MESSAGE_PREFIX}${threadId}_${index}`,
        name,
        from: "",
        sent: false,
      });
    }
  }
  rows.push(
    {
      threadId: REPLIED_THREAD_ID,
      messageId: `${MESSAGE_PREFIX}replied_in`,
      name: "Gift Card Desk",
      from: "",
      sent: false,
    },
    {
      threadId: REPLIED_THREAD_ID,
      messageId: `${MESSAGE_PREFIX}replied_out`,
      name: "Me",
      from: "playwright-sender@example.com",
      sent: true,
    },
  );
  await insertRows(emailAccountId, rows);
}

// Names share the four real threads so a move still reaches the mail emulator.
async function seedManyNames(emailAccountId: string, count: number) {
  await insertRows(
    emailAccountId,
    Array.from({ length: count }, (_, index) => {
      const label = String(index).padStart(3, "0");
      return {
        threadId: PILE[index % PILE.length].threadId,
        messageId: `${MESSAGE_PREFIX}many_${label}`,
        name: `Spoof Name ${label}`,
        from: "",
        sent: false,
      };
    }),
  );
}

type PileRow = {
  threadId: string;
  messageId: string;
  name: string;
  from: string;
  sent: boolean;
};

async function insertRows(emailAccountId: string, rows: PileRow[]) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const row of rows) {
      await client.query(
        `INSERT INTO "EmailMessage" (
           id, "createdAt", "updatedAt", "threadId", "messageId", date,
           "from", "fromName", "fromDomain", "to", "unsubscribeLink",
           read, sent, draft, inbox, "emailAccountId"
         )
         VALUES (
           $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, $3,
           CURRENT_TIMESTAMP - INTERVAL '1 day', $4, $5, '',
           'playwright-recipient@example.com', NULL, false, $6, false, true, $7
         )
         ON CONFLICT ("emailAccountId", "threadId", "messageId") DO NOTHING`,
        [
          `${MESSAGE_PREFIX}row_${row.messageId}_${emailAccountId}`,
          row.threadId,
          row.messageId,
          row.from,
          row.name,
          row.sent,
          emailAccountId,
        ],
      );
    }
  } finally {
    await client.end();
  }
}

async function deletePile(emailAccountId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `DELETE FROM "EmailMessage"
       WHERE "emailAccountId" = $1 AND "messageId" LIKE $2`,
      [emailAccountId, `${MESSAGE_PREFIX}%`],
    );
  } finally {
    await client.end();
  }
}
