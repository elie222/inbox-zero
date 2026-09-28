import { NextResponse } from "next/server";
import { saveComposeDraftBody } from "@/utils/actions/mail.validation";
import { saveComposeDraft } from "@/utils/email/compose-draft";
import { withEmailProvider } from "@/utils/middleware";

export type SaveComposeDraftResponse = Awaited<
  ReturnType<typeof saveComposeDraft>
>;

export const POST = withEmailProvider("user/drafts", async (request) => {
  const body = saveComposeDraftBody.parse(await request.json());
  const saved = await saveComposeDraft({
    provider: request.emailProvider,
    ...body,
  });
  return NextResponse.json(saved satisfies SaveComposeDraftResponse);
});
