import prisma from "@/utils/prisma";

type EmailField = "to" | "from" | "fromDomain";

interface EmailFieldStatsResult {
  data: Array<{
    to?: string;
    from?: string;
    count: number;
  }>;
}

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
  const dateRange = { fromDate, toDate };

  const emailsCount = await prisma.emailMessage.groupBy({
    by: [field],
    where: {
      emailAccountId,
      sent: isSent,
      date: {
        gte: dateRange.fromDate ? new Date(dateRange.fromDate) : undefined,
        lte: dateRange.toDate ? new Date(dateRange.toDate) : undefined,
      },
    },
    _count: {
      [field]: true,
    },
    orderBy: {
      _count: {
        [field]: "desc",
      },
    },
    take: 50,
  });

  // Create the result with the correct field name
  return {
    data: emailsCount.map((item) => {
      const resultField = field.includes("Domain")
        ? field.replace("Domain", "")
        : field;

      return {
        [resultField]: item[field] || "",
        count: item._count ? item._count[field] : 0,
      };
    }),
  };
}
