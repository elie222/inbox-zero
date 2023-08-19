import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { classify, classifyThreadBody } from "@/app/api/ai/classify/controller";

export const runtime = "edge";

export const POST = withError(async (request: Request) => {
  const json = await request.json();
  const body = classifyThreadBody.parse(json);
  const res = await classify(body);

  return NextResponse.json(res);
});
