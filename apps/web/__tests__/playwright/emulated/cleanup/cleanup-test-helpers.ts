import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

const CLEANUP_SENDERS = [
  "cleanup-block@example.com",
  "cleanup-archive@example.com",
  "cleanup-keep@example.com",
];

const CLEANUP_NEWSLETTERS = [
  "cleanup-archive@example.com",
  "cleanup-keep@example.com",
];

export const CLEANUP_BLOCK_THREAD_ID = "thr_playwright_cleanup_block";
export const CLEANUP_ARCHIVE_THREAD_ID = "thr_playwright_cleanup_archive";
export const CLEANUP_KEEP_THREAD_ID = "thr_playwright_cleanup_keep";

export type CleanupFixture = {
  emailAccountId: string;
  previousAutoCategorizeSenders: boolean;
  previousPremiumId: string | null;
  premiumId: string;
  categoryIds: string[];
};

export async function prepareCleanupFixture(
  page: Page,
): Promise<CleanupFixture> {
  const { id: emailAccountId } = await getEmailAccount(page);
  const client = await connectToDatabase();
  const runId = process.env.PLAYWRIGHT_RUN_ID ?? "local";
  const premiumId = `playwright_cleanup_premium_${runId}`;

  try {
    const accountResult = await client.query<{
      autoCategorizeSenders: boolean;
      premiumId: string | null;
    }>(
      `SELECT ea."autoCategorizeSenders", u."premiumId"
       FROM "EmailAccount" ea
       JOIN "User" u ON u.id = ea."userId"
       WHERE ea.id = $1`,
      [emailAccountId],
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error("The Playwright email account was not found");

    await deleteCleanupRows(client, emailAccountId);

    await client.query(
      `INSERT INTO "Premium" (id, "createdAt", "updatedAt", "pendingInvites", tier)
       VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ARRAY[]::text[], 'PRO_MONTHLY')
       ON CONFLICT (id) DO UPDATE
       SET tier = EXCLUDED.tier, "updatedAt" = CURRENT_TIMESTAMP`,
      [premiumId],
    );
    await client.query(
      `UPDATE "User"
       SET "premiumId" = $2, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = (SELECT "userId" FROM "EmailAccount" WHERE id = $1)`,
      [emailAccountId, premiumId],
    );
    await client.query(
      `UPDATE "EmailAccount"
       SET "autoCategorizeSenders" = true, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [emailAccountId],
    );

    const categoryIds = await seedBulkArchiveData(client, emailAccountId);
    await seedEmailStats(client, emailAccountId);

    return {
      emailAccountId,
      previousAutoCategorizeSenders: account.autoCategorizeSenders,
      previousPremiumId: account.premiumId,
      premiumId,
      categoryIds,
    };
  } finally {
    await client.end();
  }
}

export async function cleanUpFixture(fixture: CleanupFixture) {
  const client = await connectToDatabase();

  try {
    await deleteCleanupRows(client, fixture.emailAccountId);
    await client.query(
      `DELETE FROM "Category"
       WHERE "emailAccountId" = $1 AND id = ANY($2::text[])`,
      [fixture.emailAccountId, fixture.categoryIds],
    );
    await client.query(
      `UPDATE "EmailAccount"
       SET "autoCategorizeSenders" = $2, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [fixture.emailAccountId, fixture.previousAutoCategorizeSenders],
    );
    await client.query(
      `UPDATE "User"
       SET "premiumId" = $2, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "premiumId" = $3
         AND id = (SELECT "userId" FROM "EmailAccount" WHERE id = $1)`,
      [fixture.emailAccountId, fixture.previousPremiumId, fixture.premiumId],
    );
    await client.query(`DELETE FROM "Premium" WHERE id = $1`, [
      fixture.premiumId,
    ]);
  } finally {
    await client.end();
  }
}

export async function restoreCleanupThreads(
  page: Page,
  emailAccountId: string,
  threadIds: string[],
) {
  for (const threadId of threadIds) {
    const response = await page.request.post(
      `/api/threads/${threadId}/unarchive`,
      { headers: { "X-Email-Account-ID": emailAccountId } },
    );
    expect(response.ok()).toBeTruthy();
  }
}

export async function openCleanupFeature(
  page: Page,
  fixture: CleanupFixture,
  expectedPath: string,
) {
  await page.goto(`/${fixture.emailAccountId}/${expectedPath}`);
  await expect(page).toHaveURL(
    new RegExp(`/${fixture.emailAccountId}/${expectedPath}(?:\\?.*)?$`),
  );
}

async function getEmailAccount(page: Page) {
  const response = await page.request.get("/api/user/email-accounts");
  expect(response.ok()).toBeTruthy();
  const { emailAccounts } = (await response.json()) as {
    emailAccounts: { id: string; email: string }[];
  };
  const emailAccount = emailAccounts[0];
  if (!emailAccount) throw new Error("The setup project created no account");
  return emailAccount;
}

async function connectToDatabase() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

async function deleteCleanupRows(client: Client, emailAccountId: string) {
  await client.query(
    `DELETE FROM "EmailMessage"
     WHERE "emailAccountId" = $1
       AND (
         "messageId" LIKE 'playwright_cleanup_%'
         OR "from" = ANY($2::text[])
       )`,
    [emailAccountId, CLEANUP_SENDERS],
  );
  await client.query(
    `DELETE FROM "Newsletter"
     WHERE "emailAccountId" = $1 AND email = ANY($2::text[])`,
    [emailAccountId, [...CLEANUP_SENDERS, "analytics-sender@example.com"]],
  );
}

async function seedBulkArchiveData(client: Client, emailAccountId: string) {
  const categoryIds: string[] = [];
  const ownedCategoryIds: string[] = [];

  for (const [index, name] of ["Newsletter", "Marketing"].entries()) {
    const id = `playwright_cleanup_category_${index}_${emailAccountId}`;
    const result = await client.query<{ id: string }>(
      `INSERT INTO "Category" (id, "createdAt", "updatedAt", name, description, "emailAccountId")
       VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, $3, $4)
       ON CONFLICT (name, "emailAccountId") DO UPDATE
       SET description = EXCLUDED.description, "updatedAt" = CURRENT_TIMESTAMP
       RETURNING id`,
      [
        id,
        name,
        `${name} messages for Playwright cleanup coverage`,
        emailAccountId,
      ],
    );
    const categoryId = result.rows[0]?.id;
    if (!categoryId) throw new Error(`Could not seed ${name} category`);
    categoryIds.push(categoryId);
    if (categoryId === id) ownedCategoryIds.push(categoryId);
  }

  await client.query(
    `INSERT INTO "Newsletter" (id, "createdAt", "updatedAt", email, name, "emailAccountId", "categoryId")
     VALUES
       ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, 'Cleanup Newsletter', $5, $6),
       ($3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4, 'Cleanup Keep', $5, $6)
     ON CONFLICT (email, "emailAccountId") DO UPDATE
     SET name = EXCLUDED.name, "categoryId" = EXCLUDED."categoryId", "updatedAt" = CURRENT_TIMESTAMP`,
    [
      `playwright_cleanup_newsletter_archive_${emailAccountId}`,
      CLEANUP_NEWSLETTERS[0],
      `playwright_cleanup_newsletter_keep_${emailAccountId}`,
      CLEANUP_NEWSLETTERS[1],
      emailAccountId,
      categoryIds[0],
    ],
  );

  return ownedCategoryIds;
}

async function seedEmailStats(client: Client, emailAccountId: string) {
  const rows = [
    {
      id: "block-1",
      threadId: "db_cleanup_block_1",
      messageId: "playwright_cleanup_block_1",
      from: "cleanup-block@example.com",
      fromName: "Cleanup Weekly",
      to: "playwright-recipient@example.com",
      read: false,
      sent: false,
      inbox: true,
    },
    {
      id: "block-2",
      threadId: "db_cleanup_block_2",
      messageId: "playwright_cleanup_block_2",
      from: "cleanup-block@example.com",
      fromName: "Cleanup Weekly",
      to: "playwright-recipient@example.com",
      read: false,
      sent: false,
      inbox: true,
    },
    ...[1, 2, 3].map((number) => ({
      id: `analytics-received-${number}`,
      threadId: `db_cleanup_analytics_received_${number}`,
      messageId: `playwright_cleanup_analytics_received_${number}`,
      from: "analytics-sender@example.com",
      fromName: "Analytics Sender",
      to: "playwright-recipient@example.com",
      read: number !== 3,
      sent: false,
      inbox: number !== 2,
    })),
    ...[1, 2].map((number) => ({
      id: `analytics-sent-${number}`,
      threadId: `db_cleanup_analytics_sent_${number}`,
      messageId: `playwright_cleanup_analytics_sent_${number}`,
      from: "playwright-sender@example.com",
      fromName: "Playwright Sender",
      to: "analytics-recipient@example.com",
      read: true,
      sent: true,
      inbox: false,
    })),
  ];

  for (const row of rows) {
    await client.query(
      `INSERT INTO "EmailMessage" (
         id, "createdAt", "updatedAt", "threadId", "messageId", date,
         "from", "fromName", "fromDomain", "to", "unsubscribeLink",
         read, sent, draft, inbox, "emailAccountId"
       )
       VALUES (
         $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, $3,
         CURRENT_TIMESTAMP - INTERVAL '1 day', $4, $5, $6, $7, NULL,
         $8, $9, false, $10, $11
       )
       ON CONFLICT ("emailAccountId", "threadId", "messageId") DO UPDATE
       SET date = EXCLUDED.date, read = EXCLUDED.read, sent = EXCLUDED.sent,
           inbox = EXCLUDED.inbox, "updatedAt" = CURRENT_TIMESTAMP`,
      [
        `playwright_cleanup_email_${row.id}_${emailAccountId}`,
        row.threadId,
        row.messageId,
        row.from,
        row.fromName,
        row.from.split("@")[1],
        row.to,
        row.read,
        row.sent,
        row.inbox,
        emailAccountId,
      ],
    );
  }
}
