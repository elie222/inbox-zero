import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { ExecutedRuleStatus } from "@prisma/client";

const rejectPlanBody = z.object({ threadId: z.string() });
export type RejectPlanBody = z.infer<typeof rejectPlanBody>;
export type RejectPlanResponse = Awaited<ReturnType<typeof rejectPlan>>;

async function rejectPlan(body: RejectPlanBody, userId: string) {
  return await prisma?.executedRule.updateMany({
    where: {
      userId,
      threadId: body.threadId,
    },
    data: {
      status: ExecutedRuleStatus.REJECTED,
    },
  });
}

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = rejectPlanBody.parse(json);

  const result = await rejectPlan(body, session.user.id);

  return NextResponse.json(result);
});
