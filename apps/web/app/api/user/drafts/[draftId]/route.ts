import { NextResponse } from "next/server";
import {
  discardComposeDraftBody,
  saveComposeDraftBody,
} from "@/utils/actions/mail.validation";
import {
  discardComposeDraft,
  saveComposeDraft,
} from "@/utils/email/compose-draft";
import { withEmailProvider } from "@/utils/middleware";

type SaveComposeDraftResponse = Awaited<ReturnType<typeof saveComposeDraft>>;

export type DiscardComposeDraftResponse = { success: true };

export const PUT = withEmailProvider(
  "user/drafts/update",
  async (request, context) => {
    const { draftId } = discardComposeDraftBody.parse(await context.params);
    const body = saveComposeDraftBody.parse(await request.json());
    const saved = await saveComposeDraft({
      provider: request.emailProvider,
      content: body.content,
      draftId,
    });
    return NextResponse.json(saved satisfies SaveComposeDraftResponse);
  },
);

export const DELETE = withEmailProvider(
  "user/drafts/discard",
  async (request, context) => {
    const { draftId } = discardComposeDraftBody.parse(await context.params);
    await discardComposeDraft({
      provider: request.emailProvider,
      draftId,
    });
    return NextResponse.json({
      success: true,
    } satisfies DiscardComposeDraftResponse);
  },
);
