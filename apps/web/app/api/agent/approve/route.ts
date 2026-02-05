import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import { approveAgentAction } from "@/utils/ai/agent/execution";

const approveSchema = z.object({
  approvalId: z.string().min(1),
});

export const POST = withEmailAccount("agent-approve", async (request) => {
  const json = await request.json();
  const { data, error } = approveSchema.safeParse(json);

  if (error) {
    return NextResponse.json({ error: error.errors }, { status: 400 });
  }

  const result = await approveAgentAction({
    approvalId: data.approvalId,
    userId: request.auth.userId,
    logger: request.logger,
  });

  if (result.error) {
    const status = result.error.includes("Unauthorized") ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true, logId: result.logId });
});
