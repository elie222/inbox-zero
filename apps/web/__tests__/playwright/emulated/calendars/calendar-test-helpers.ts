import { expect, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

export const PLAYWRIGHT_TEST_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-test@gmail.com";

export async function openCalendars(page: Page) {
  let emailAccountId: string | undefined;
  await expect
    .poll(
      async () => {
        try {
          emailAccountId = await getEmailAccountId(page);
          return true;
        } catch {
          return false;
        }
      },
      { timeout: 120_000 },
    )
    .toBe(true);
  if (!emailAccountId) throw new Error("The Playwright account was not ready");

  await navigateUntilReady(
    page,
    `/${emailAccountId}/calendars`,
    page.getByRole("heading", { name: "Calendars", exact: true }),
  );
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

export async function getCalendarTestState() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{
      bookingLink: string | null;
      calendarEnabled: boolean;
      timezone: string | null;
    }>(
      `SELECT
         ea."calendarBookingLink" AS "bookingLink",
         ea.timezone,
         calendar."isEnabled" AS "calendarEnabled"
       FROM "EmailAccount" ea
       JOIN "CalendarConnection" connection
         ON connection."emailAccountId" = ea.id
       JOIN "Calendar" calendar
         ON calendar."connectionId" = connection.id
       WHERE ea.email = $1
         AND connection.id = ea.id || '-playwright-calendar'
         AND calendar.id = ea.id || '-playwright-primary-calendar'`,
      [PLAYWRIGHT_TEST_EMAIL],
    );
    const state = result.rows[0];
    if (!state) throw new Error("The Playwright calendar state was not found");
    return state;
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

async function navigateUntilReady(page: Page, url: string, ready: Locator) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(url, { timeout: 60_000, waitUntil: "domcontentloaded" });
      await expect(ready).toBeVisible({ timeout: 60_000 });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
}
