import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import type { ThreadsResponse } from "@/app/api/threads/route";

export type GetThreadsResponse = {
  threads: ThreadsResponse["threads"];
};

export const dynamic = "force-dynamic";

export const maxDuration = 30;

export const GET = withEmailProvider("threads/basic", async (request) => {
  const { emailProvider } = request;
  const { emailAccountId } = request.auth;

  const { searchParams } = new URL(request.url);
  const fromEmail = searchParams.get("fromEmail");
  const labelId = searchParams.get("labelId");

  try {
    const { threads } = await emailProvider.getThreadsWithQuery({
      query: {
        fromEmail,
        labelId,
      },
    });

    return NextResponse.json({ threads });
  } catch (error) {
    request.logger.error("Error fetching basic threads", {
      error,
      emailAccountId,
    });
    return NextResponse.json(
      { error: "Failed to fetch threads" },
      { status: 500 },
    );
  }
});
