import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import type { EmailProvider } from "@/utils/email/types";
import { threadsQuery } from "@/utils/threads/validation";
import { EMAIL_PROVIDER_RATE_LIMIT_MESSAGE, SafeError } from "@/utils/error";
import { isEmailProviderRateLimitError } from "@/utils/email/is-provider-rate-limit-error";

// Straight from the provider — this route does no ExecutedRule join, so it
// must not borrow the main threads type, which promises `plan` and `plans`.
export type GetThreadsResponse = {
  threads: Awaited<ReturnType<EmailProvider["getThreadsWithQuery"]>>["threads"];
  nextPageToken?: string;
};

export const maxDuration = 30;

export const GET = withEmailProvider("threads/basic", async (request) => {
  const { emailProvider } = request;
  const { emailAccountId } = request.auth;

  const { searchParams } = new URL(request.url);
  // Object refinements make .pick() throw as of Zod 4.3. This route only
  // reads these fields, so the inbox-wide refinements do not apply.
  const query = z
    .object(threadsQuery.shape)
    .pick({
      fromEmail: true,
      labelId: true,
      limit: true,
      nextPageToken: true,
      type: true,
    })
    .parse({
      fromEmail: searchParams.get("fromEmail"),
      labelId: searchParams.get("labelId"),
      limit: searchParams.get("limit"),
      nextPageToken: searchParams.get("nextPageToken"),
      type: searchParams.get("type"),
    });

  try {
    const { threads, nextPageToken } = await emailProvider.getThreadsWithQuery({
      query,
      maxResults: query.limit || 100,
      pageToken: query.nextPageToken || undefined,
    });

    return NextResponse.json({
      threads,
      nextPageToken,
    });
  } catch (error) {
    request.logger.error("Error fetching basic threads", {
      error,
      emailAccountId,
    });
    if (
      isEmailProviderRateLimitError({
        error,
        provider: emailProvider.name,
      })
    ) {
      throw new SafeError(EMAIL_PROVIDER_RATE_LIMIT_MESSAGE, 429);
    }

    return NextResponse.json(
      { error: "Failed to fetch threads" },
      { status: 500 },
    );
  }
});
