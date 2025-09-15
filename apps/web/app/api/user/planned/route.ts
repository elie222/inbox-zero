import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { ExecutedRuleStatus } from "@prisma/client";
import { getExecutedRules } from "@/app/api/user/planned/get-executed-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // TODO not great if this is taking more than 15s

export type PendingExecutedRules = Awaited<ReturnType<typeof getExecutedRules>>;

export const GET = withEmailProvider(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const url = new URL(request.url);
  const page = Number.parseInt(url.searchParams.get("page") || "1");
  const ruleId = url.searchParams.get("ruleId") || "all";

  const messages = await getExecutedRules({
    status: ExecutedRuleStatus.PENDING,
    page,
    ruleId,
    emailAccountId,
    emailProvider: request.emailProvider,
  });

  return NextResponse.json(messages);
});
