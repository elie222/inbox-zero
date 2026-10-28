import { NextResponse } from "next/server";
import {
  readComposeDraftQuery,
  saveComposeDraftBody,
} from "@/utils/actions/mail.validation";
import { saveComposeDraft } from "@/utils/email/compose-draft";
import { readComposeDraftForMessage } from "@/utils/email/read-compose-draft";
import { withEmailProvider } from "@/utils/middleware";

export type SaveComposeDraftResponse = Awaited<
  ReturnType<typeof saveComposeDraft>
>;
export type ReadComposeDraftResponse = NonNullable<
  Awaited<ReturnType<typeof readComposeDraftForMessage>>
>;

export const GET = withEmailProvider(
  "user/drafts/read-for-message",
  async (request) => {
    const { messageId } = readComposeDraftQuery.parse({
      messageId: request.nextUrl.searchParams.get("messageId"),
    });
    const draft = await readComposeDraftForMessage({
      provider: request.emailProvider,
      messageId,
    });
    if (!draft)
      return NextResponse.json(
        { error: "Draft not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    return NextResponse.json(draft satisfies ReadComposeDraftResponse, {
      headers: { "Cache-Control": "no-store" },
    });
  },
);

export const POST = withEmailProvider("user/drafts", async (request) => {
  const body = saveComposeDraftBody.parse(await request.json());
  const saved = await saveComposeDraft({
    provider: request.emailProvider,
    ...body,
  });
  return NextResponse.json(saved satisfies SaveComposeDraftResponse);
});
