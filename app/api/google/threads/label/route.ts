import { NextResponse } from "next/server";
import { getSession } from "@/utils/auth";
import { withError } from "@/utils/middleware";
import {
  labelThread,
  labelThreadBody,
} from "@/app/api/google/threads/label/controller";

export const POST = withError(async (request: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = labelThreadBody.parse(json);
  const label = await labelThread(body);

  return NextResponse.json(label);
});
