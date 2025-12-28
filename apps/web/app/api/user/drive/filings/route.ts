import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});
export type GetFilingsQuery = z.infer<typeof querySchema>;

export type GetFilingsResponse = Awaited<ReturnType<typeof getFilings>>;

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const { searchParams } = new URL(request.url);
  const query = querySchema.parse({
    limit: searchParams.get("limit"),
    offset: searchParams.get("offset"),
  });

  const result = await getFilings({ emailAccountId, ...query });
  return NextResponse.json(result);
});

async function getFilings({
  emailAccountId,
  limit,
  offset,
}: {
  emailAccountId: string;
  limit: number;
  offset: number;
}) {
  const [filings, total] = await Promise.all([
    prisma.documentFiling.findMany({
      where: { emailAccountId },
      select: {
        id: true,
        filename: true,
        folderPath: true,
        fileId: true,
        status: true,
        confidence: true,
        reasoning: true,
        wasAsked: true,
        wasCorrected: true,
        originalPath: true,
        createdAt: true,
        driveConnectionId: true,
        feedbackPositive: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.documentFiling.count({ where: { emailAccountId } }),
  ]);

  return {
    filings,
    total,
    hasMore: offset + filings.length < total,
  };
}
