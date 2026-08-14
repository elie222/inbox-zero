import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { threadsQuery, threadsView } from "@/utils/threads/validation";
import { loadThreads, toListThreads } from "@/utils/threads/load";

export const maxDuration = 30;

export const GET = withEmailProvider(
  "threads",
  async (request) => {
    const { emailProvider } = request;
    const { emailAccountId } = request.auth;

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit");
    const fromEmail = searchParams.get("fromEmail");
    const type = searchParams.get("type");
    const folderId = searchParams.get("folderId");
    const inboxSection = searchParams.get("inboxSection");
    const nextPageToken = searchParams.get("nextPageToken");
    const q = searchParams.get("q");
    const labelId = searchParams.get("labelId");
    const labelIds = searchParams
      .getAll("labelIds")
      .flatMap((value) => value.split(","))
      .map((labelId) => labelId.trim())
      .filter(Boolean);
    const after = searchParams.get("after");
    const before = searchParams.get("before");
    const isUnread = searchParams.get("isUnread");
    const view = threadsView.parse(searchParams.get("view"));

    const query = threadsQuery.parse({
      limit,
      fromEmail,
      type,
      folderId,
      inboxSection,
      nextPageToken,
      q,
      labelId,
      labelIds: labelIds.length ? labelIds : undefined,
      after,
      before,
      isUnread,
    });

    try {
      const threads = await loadThreads({
        query,
        emailAccountId,
        emailProvider,
        messageFormat: view === "list" ? "metadata" : "full",
      });
      return NextResponse.json(
        view === "list" ? toListThreads(threads) : threads,
      );
    } catch (error) {
      request.logger.error("Error fetching threads", {
        error,
        emailAccountId,
      });
      return NextResponse.json(
        { error: "Failed to fetch threads" },
        { status: 500 },
      );
    }
  },
  { requestTiming: {} },
);

export type ThreadsResponse = Awaited<ReturnType<typeof loadThreads>>;

/** Slim rows for the mail list: `?view=list`. No message bodies or attachments. */
export type ThreadsListResponse = ReturnType<typeof toListThreads>;
