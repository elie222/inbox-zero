import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getOutlookThreads } from "./controller";
import { threadsQuery } from "./validation";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = withEmailAccount(async (request) => {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 20);
  const skip = Number(searchParams.get("skip") ?? 0);
  const filter = searchParams.get("filter") ?? undefined;
  const query = threadsQuery.parse({ limit, skip, filter });

  const session = await auth();
  const accessToken = session.accessToken ?? session.user.accessToken;
  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing Outlook access token" },
      { status: 401 },
    );
  }

  const emailAccountId = request.auth.emailAccountId;

  const threads = await getOutlookThreads({
    accessToken,
    query,
  });

  return NextResponse.json(threads);
});
