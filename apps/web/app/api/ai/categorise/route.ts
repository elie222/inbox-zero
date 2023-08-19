import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { categorise, categoriseBody } from "@/app/api/ai/categorise/controller";

export const runtime = "edge";

export const POST = withError(async (request: Request) => {
  const json = await request.json();
  const body = categoriseBody.parse(json);
  const res = await categorise(body);

  return NextResponse.json(res);
});
