import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "@/utils/auth";
import { plan, planBody } from "@/app/api/ai/plan/controller";

// Next Auth does not support edge runtime but will do soon:
// https://github.com/vercel/next.js/issues/50444#issuecomment-1602746782
// export const runtime = "edge";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.email) return;

  const json = await request.json();
  const body = planBody.parse(json);

  const res = await plan(body, session.user);

  return NextResponse.json(res);
}
