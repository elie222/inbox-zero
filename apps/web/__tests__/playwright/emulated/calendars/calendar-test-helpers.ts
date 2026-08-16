import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

export const PLAYWRIGHT_TEST_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-test@gmail.com";

export async function openCalendars(page: Page) {
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/calendars`);
  await expect(
    page.getByRole("heading", { name: "Calendars", exact: true }),
  ).toBeVisible();
  return { emailAccountId };
}

export async function setupCalendarTestState() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await resetCalendarState(client);
    const result = await client.query(
      `WITH target AS (
         SELECT
           ea.id AS "emailAccountId",
           ea.email,
           account.access_token,
           account.refresh_token,
           account.expires_at
         FROM "EmailAccount" ea
         INNER JOIN "Account" account ON account.id = ea."accountId"
         WHERE ea.email = $1
       ), connection AS (
         INSERT INTO "CalendarConnection" (
           id, "createdAt", "updatedAt", provider, email,
           "accessToken", "refreshToken", "expiresAt", "isConnected",
           "emailAccountId"
         )
         SELECT
           target."emailAccountId" || '-playwright-calendar',
           CURRENT_TIMESTAMP,
           CURRENT_TIMESTAMP,
           'google',
           target.email,
           target.access_token,
           target.refresh_token,
           target.expires_at,
           true,
           target."emailAccountId"
         FROM target
         RETURNING id, "emailAccountId"
       )
       INSERT INTO "Calendar" (
         id, "createdAt", "updatedAt", "calendarId", name, "primary",
         "isEnabled", timezone, "connectionId"
       )
       SELECT
         connection."emailAccountId" || '-playwright-primary-calendar',
         CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP,
         'primary',
         $1,
         true,
         true,
         'UTC',
         connection.id
       FROM connection
       RETURNING id`,
      [PLAYWRIGHT_TEST_EMAIL],
    );
    if (result.rowCount !== 1) {
      throw new Error("Could not seed the Playwright calendar connection");
    }
  } finally {
    await client.end();
  }
}

export async function resetCalendarTestState() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await resetCalendarState(client);
  } finally {
    await client.end();
  }
}

async function getEmailAccountId(page: Page) {
  const response = await page.request.get("/api/user/email-accounts");
  expect(response.ok()).toBeTruthy();
  const { emailAccounts } = (await response.json()) as {
    emailAccounts: { id: string }[];
  };
  const emailAccountId = emailAccounts[0]?.id;
  if (!emailAccountId) throw new Error("The setup project created no account");
  return emailAccountId;
}

async function resetCalendarState(client: Client) {
  await client.query(
    `DELETE FROM "CalendarConnection"
     WHERE "emailAccountId" = (
       SELECT id FROM "EmailAccount" WHERE email = $1
     )`,
    [PLAYWRIGHT_TEST_EMAIL],
  );
  await client.query(
    `UPDATE "EmailAccount"
     SET timezone = NULL, "calendarBookingLink" = NULL
     WHERE email = $1`,
    [PLAYWRIGHT_TEST_EMAIL],
  );
}
