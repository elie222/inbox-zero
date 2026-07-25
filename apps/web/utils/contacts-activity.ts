import { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import type { ContactActivity } from "@/utils/contacts";

// Per-address aggregates over the EmailMessage cache: senders of received
// mail + recipients of sent mail. Shared by the contacts list (windowed)
// and the domain-stats endpoint (full history).
export async function queryContactActivity({
  emailAccountId,
  userEmail,
  searchTerm,
  sort = "recent",
  limit,
  emails,
}: {
  emailAccountId: string;
  userEmail: string;
  searchTerm?: string;
  sort?: "recent" | "frequent" | "name";
  limit?: number;
  emails?: string[];
}): Promise<ContactActivity[]> {
  const filterClause = emails?.length
    ? Prisma.sql`WHERE email IN (${Prisma.join(emails)})`
    : searchTerm
      ? Prisma.sql`WHERE (position(${searchTerm} in email) > 0 OR position(${searchTerm} in LOWER(COALESCE(name, ''))) > 0)`
      : Prisma.empty;
  const orderByClause =
    sort === "frequent"
      ? Prisma.sql`("receivedCount" + "sentCount") DESC`
      : sort === "name"
        ? Prisma.sql`LOWER(COALESCE(NULLIF(name, ''), email)) ASC`
        : Prisma.sql`"lastInteractionAt" DESC`;
  const limitClause = limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;

  return prisma.$queryRaw<ContactActivity[]>`
    WITH combined AS (
      SELECT LOWER("from") AS email, NULLIF("fromName", '') AS name, 1 AS received, 0 AS sent, "date"
      FROM "EmailMessage"
      WHERE "emailAccountId" = ${emailAccountId} AND sent = false AND draft = false AND "from" <> ''
      UNION ALL
      SELECT LOWER("to") AS email, NULL AS name, 0 AS received, 1 AS sent, "date"
      FROM "EmailMessage"
      WHERE "emailAccountId" = ${emailAccountId} AND sent = true AND draft = false AND "to" <> '' AND "to" <> 'Missing'
    ),
    grouped AS (
      SELECT
        email,
        MAX(name) AS name,
        SUM(received)::int AS "receivedCount",
        SUM(sent)::int AS "sentCount",
        MAX("date") AS "lastInteractionAt"
      FROM combined
      WHERE email <> ${userEmail.toLowerCase()}
      GROUP BY email
    )
    SELECT * FROM grouped
    ${filterClause}
    ORDER BY ${orderByClause}
    ${limitClause}
  `;
}
