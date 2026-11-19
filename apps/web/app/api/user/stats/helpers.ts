import prisma from "@/utils/prisma";
import { Prisma } from "@/generated/prisma/client";

type EmailField = "to" | "from" | "fromDomain";

interface EmailFieldStatsResult {
  data: Array<{
    to?: string;
    from?: string;
    count: number;
  }>;
}

const FIELD_COLUMNS: Record<EmailField, Prisma.Sql> = {
  to: Prisma.raw('"to"'),
  from: Prisma.raw('"from"'),
  fromDomain: Prisma.raw('"fromDomain"'),
};

/**
 * Get detailed email stats for a specific field
 */
export async function getEmailFieldStats({
  emailAccountId,
  fromDate,
  toDate,
  field,
  isSent,
}: {
  emailAccountId: string;
  fromDate?: number | null;
  toDate?: number | null;
  field: EmailField;
  isSent: boolean;
}): Promise<EmailFieldStatsResult> {
  const column = FIELD_COLUMNS[field];
  const conditions = [
    Prisma.sql`"emailAccountId" = ${emailAccountId}`,
    Prisma.sql`sent = ${isSent}`,
    Prisma.sql`${column} IS NOT NULL`,
  ];
  if (fromDate) conditions.push(Prisma.sql`date >= ${new Date(fromDate)}`);
  if (toDate) conditions.push(Prisma.sql`date <= ${new Date(toDate)}`);

  // Addresses and domains are stored as the sender wrote them, so group
  // case-insensitively to count one sender once.
  const query = Prisma.sql`
    SELECT LOWER(${column}) AS "value", COUNT(*) AS "count"
    FROM "EmailMessage"
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY LOWER(${column})
    ORDER BY "count" DESC
    LIMIT 50
  `;
  const emailsCount =
    await prisma.$queryRaw<Array<{ value: string; count: bigint }>>(query);

  // Create the result with the correct field name
  const resultField = field.includes("Domain")
    ? field.replace("Domain", "")
    : field;

  return {
    data: emailsCount.map((item) => ({
      [resultField]: item.value,
      count: Number(item.count),
    })),
  };
}
