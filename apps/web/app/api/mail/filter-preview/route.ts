import { z } from "zod";
import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

const querySchema = z.object({
  matchType: z.enum(["sender", "domain", "subject"]),
  // One value or a comma-separated list (bulk selection)
  value: z.string().min(1).max(2000),
});

export type FilterPreviewResponse = Awaited<ReturnType<typeof getPreview>>;

export const GET = withEmailAccount("mail/filter-preview", async (request) => {
  const { emailAccountId } = request.auth;
  const { searchParams } = new URL(request.url);
  const query = querySchema.parse({
    matchType: searchParams.get("matchType"),
    value: searchParams.get("value"),
  });

  const result = await getPreview({ emailAccountId, ...query });

  return NextResponse.json(result);
});

// Counts from the local EmailMessage cache how much mail a proposed filter
// touches: everything, what's sitting in the inbox now (what "apply to
// past" would move), and the last-7-days picture for the AI-rule preview.
// The cache has no subject column, so subject filters can't be counted.
async function getPreview({
  emailAccountId,
  matchType,
  value,
}: {
  emailAccountId: string;
  matchType: "sender" | "domain" | "subject";
  value: string;
}) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const received = { emailAccountId, sent: false, draft: false };

  if (matchType === "subject") {
    const scanned7Days = await prisma.emailMessage.count({
      where: { ...received, date: { gte: sevenDaysAgo } },
    });
    return {
      countable: false as const,
      total: null,
      inbox: null,
      last7Days: null,
      scanned7Days,
    };
  }

  const parts = value
    .split(/[|,]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const match =
    matchType === "sender"
      ? {
          OR: parts.map((part) => ({
            from: { equals: part, mode: "insensitive" as const },
          })),
        }
      : { fromDomain: { in: parts.map((part) => part.replace(/^@/, "")) } };

  const [total, inbox, last7Days, scanned7Days] = await Promise.all([
    prisma.emailMessage.count({ where: { ...received, ...match } }),
    prisma.emailMessage.count({
      where: { ...received, ...match, inbox: true },
    }),
    prisma.emailMessage.count({
      where: { ...received, ...match, date: { gte: sevenDaysAgo } },
    }),
    prisma.emailMessage.count({
      where: { ...received, date: { gte: sevenDaysAgo } },
    }),
  ]);

  return { countable: true as const, total, inbox, last7Days, scanned7Days };
}
