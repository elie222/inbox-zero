import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import { denyAgentAction } from "@/utils/ai/agent/execution";

const denySchema = z.object({
  approvalId: z.string().min(1),
});

export const POST = withEmailAccount("agent-deny", async (request) => {
  const json = await request.json();
  const { data, error } = denySchema.safeParse(json);

  if (error) {
    return NextResponse.json({ error: error.errors }, { status: 400 });
  }

  const result = await denyAgentAction({
    approvalId: data.approvalId,
    userId: request.auth.userId,
  });

  if (result.error) {
    const status = result.error.includes("Unauthorized") ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true });
});
