import "server-only";
import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import { plan, planBody } from "@/app/api/ai/plan/controller";
import { withError } from "@/utils/middleware";

// Next Auth does not support edge runtime but will do soon:
// https://github.com/vercel/next.js/issues/50444#issuecomment-1602746782
// export const runtime = "edge";

export const POST = withError(async (request: Request) => {
  const session = await getAuthSession();
  if (!session?.user.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json();
  const body = planBody.parse(json);

  const res = await plan(body, session.user);

  return NextResponse.json(res);
});
