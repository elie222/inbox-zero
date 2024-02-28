import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getThreads } from "@/app/api/google/threads/controller";
import { threadsQuery } from "@/app/api/google/threads/validation";

export const dynamic = "force-dynamic";

export const maxDuration = 30;

export const GET = withError(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");
  const fromEmail = searchParams.get("fromEmail");
  const type = searchParams.get("type");
  const query = threadsQuery.parse({ limit, fromEmail, type });

  const threads = await getThreads(query);
  return NextResponse.json(threads);
});
