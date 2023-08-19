import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { categorise, categoriseBody } from "@/app/api/ai/categorise/controller";
import { getAuthSession } from "@/utils/auth";

export const POST = withError(async (request: Request) => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = categoriseBody.parse(json);
  const res = await categorise(body, { email: session.user.email });

  return NextResponse.json(res);
});
