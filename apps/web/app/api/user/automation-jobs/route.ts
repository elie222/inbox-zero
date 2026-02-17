import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetAutomationJobResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("user/automation-jobs", async (request) => {
  const { emailAccountId } = request.auth;
  const result = await getData({ emailAccountId });
  return NextResponse.json(result);
});

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const job = await prisma.automationJob.findFirst({
    where: { emailAccountId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      enabled: true,
      jobType: true,
      prompt: true,
      cronExpression: true,
      messagingChannelId: true,
      nextRunAt: true,
    },
  });

  return { job };
}
