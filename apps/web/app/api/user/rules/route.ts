import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { startRequestTimer } from "@/utils/request-timing";

export type RulesResponse = Awaited<ReturnType<typeof getRules>>;

async function getRules({ emailAccountId }: { emailAccountId: string }) {
  return await prisma.rule.findMany({
    where: { emailAccountId },
    include: {
      actions: true,
      group: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export const GET = withEmailAccount("user/rules", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const requestTimer = startRequestTimer({
    logger: request.logger,
    requestName: "Rules request",
    runningWarnAfterMs: 8000,
    slowWarnAfterMs: 2000,
  });

  try {
    const result = await getRules({ emailAccountId });
    requestTimer.logSlowCompletion({ ruleCount: result.length });
    return NextResponse.json(result);
  } catch (error) {
    request.logger.error("Error fetching rules", {
      error,
      durationMs: requestTimer.durationMs(),
    });
    return NextResponse.json(
      { error: "Failed to fetch rules" },
      { status: 500 },
    );
  } finally {
    requestTimer.stop();
  }
});
