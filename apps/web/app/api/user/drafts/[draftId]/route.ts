import { NextResponse } from "next/server";
import {
  composeDraftParams,
  saveComposeDraftBody,
} from "@/utils/actions/mail.validation";
import {
  discardComposeDraft,
  saveComposeDraft,
} from "@/utils/email/compose-draft";
import { withEmailProvider } from "@/utils/middleware";
import { readComposeDraft } from "@/utils/email/read-compose-draft";

type SaveComposeDraftResponse = Awaited<ReturnType<typeof saveComposeDraft>>;

export type DiscardComposeDraftResponse = { success: true };
export type ReadComposeDraftResponse = NonNullable<
  Awaited<ReturnType<typeof readComposeDraft>>
>;

export const GET = withEmailProvider(
  "user/drafts/read",
  async (request, context) => {
    const { draftId } = composeDraftParams.parse(await context.params);
    const draft = await readComposeDraft({
      provider: request.emailProvider,
      draftId,
    });
    if (!draft)
      return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    return NextResponse.json(draft satisfies ReadComposeDraftResponse, {
      headers: { "Cache-Control": "no-store" },
    });
  },
);

export const PUT = withEmailProvider(
  "user/drafts/update",
  async (request, context) => {
    const { draftId } = composeDraftParams.parse(await context.params);
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
    const { draftId } = composeDraftParams.parse(await context.params);
    await discardComposeDraft({
      provider: request.emailProvider,
      draftId,
    });
    return NextResponse.json({
      success: true,
    } satisfies DiscardComposeDraftResponse);
  },
);
