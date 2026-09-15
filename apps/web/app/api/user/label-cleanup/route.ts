import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type LabelCleanupsResponse = Awaited<
  ReturnType<typeof getLabelCleanups>
>;

async function getLabelCleanups({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const cleanups = await prisma.labelCleanup.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      labelId: true,
      labelName: true,
      afterDays: true,
      action: true,
      lastRunAt: true,
      lastRunCount: true,
    },
    orderBy: { labelName: "asc" },
  });
  return { cleanups };
}

export const GET = withEmailAccount("user/label-cleanup", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getLabelCleanups({ emailAccountId });
  return NextResponse.json(result);
});
