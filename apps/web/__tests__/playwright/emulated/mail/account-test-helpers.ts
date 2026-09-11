import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { Account } from "@/generated/prisma/client";

export async function createSecondEmailAccount(
  primaryEmailAccountId: string,
  { signature }: { signature?: string } = {},
) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const suffix = randomUUID();
  const accountId = `playwright-account-${suffix}`;
  const id = `playwright-email-account-${suffix}`;
  const email = `playwright-secondary-${suffix}@gmail.com`;
  const name = "Playwright Secondary";

  try {
    await client.query("BEGIN");
    const accountResult = await client.query<Pick<Account, "userId">>(
      `INSERT INTO "Account"
        (id, "createdAt", "updatedAt", "userId", provider, type,
         "providerAccountId", refresh_token, "refreshTokenExpiresAt",
         access_token, expires_at, token_type, scope)
       SELECT $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, email_account."userId",
         'google', 'oidc', $2, account.refresh_token,
         account."refreshTokenExpiresAt", account.access_token,
         account.expires_at, account.token_type, account.scope
       FROM "EmailAccount" email_account
       JOIN "Account" account ON account.id = email_account."accountId"
       WHERE email_account.id = $3 AND account.refresh_token IS NOT NULL
       RETURNING "userId"`,
      [accountId, `playwright-provider-${suffix}`, primaryEmailAccountId],
    );
    const userId = accountResult.rows[0]?.userId;
    if (!userId)
      throw new Error("Could not clone the Playwright account credentials");

    await client.query(
      `INSERT INTO "EmailAccount"
        (id, email, name, signature, "createdAt", "updatedAt", "userId", "accountId")
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5, $6)`,
      [id, email, name, signature, userId, accountId],
    );
    await client.query("COMMIT");
    return { accountId, email, id, name };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export async function deleteSecondEmailAccount(accountId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DELETE FROM "Account" WHERE id = $1`, [accountId]);
  } finally {
    await client.end();
  }
}
