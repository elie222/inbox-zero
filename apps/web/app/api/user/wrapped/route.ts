import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import type { WrappedData } from "@/utils/wrapped/types";
import type { WrappedStatus } from "@/generated/prisma/enums";

const wrappedQuery = z.object({
  year: z.coerce.number().int().min(2020).max(2030),
});

export type GetWrappedResponse = Awaited<ReturnType<typeof getWrapped>>;

async function getWrapped({
  emailAccountId,
  year,
}: {
  emailAccountId: string;
  year: number;
}) {
  const wrapped = await prisma.emailWrapped.findUnique({
    where: {
      emailAccountId_year: { emailAccountId, year },
    },
    select: {
      id: true,
      year: true,
      status: true,
      data: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!wrapped) {
    return { wrapped: null };
  }

  return {
    wrapped: {
      id: wrapped.id,
      year: wrapped.year,
      status: wrapped.status as WrappedStatus,
      data: wrapped.data as WrappedData | null,
      createdAt: wrapped.createdAt.toISOString(),
      updatedAt: wrapped.updatedAt.toISOString(),
    },
  };
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const { searchParams } = new URL(request.url);
  const params = wrappedQuery.parse({
    year: searchParams.get("year") || new Date().getFullYear(),
  });

  const result = await getWrapped({
    emailAccountId,
    year: params.year,
  });

  return NextResponse.json(result);
});
