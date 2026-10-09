import { NextResponse } from "next/server";
import { draftAttachmentMetadataSchema } from "@/utils/actions/draft-attachments.validation";
import { composeDraftParams } from "@/utils/actions/mail.validation";
import { DRAFT_ATTACHMENT_DIRECT_UPLOAD_LIMIT_BYTES } from "@/utils/email/draft-attachment-upload";
import type { EmailProvider } from "@/utils/email/types";
import { SafeError } from "@/utils/error";
import { withEmailProvider } from "@/utils/middleware";
import { readRequestBytes } from "@/utils/request-body";

export const maxDuration = 120;

export type GetDraftAttachmentsResponse = NonNullable<
  Awaited<ReturnType<EmailProvider["getDraftAttachments"]>>
>;
export type AddDraftAttachmentResponse = Awaited<
  ReturnType<EmailProvider["addDraftAttachment"]>
>;

export const GET = withEmailProvider(
  "user/drafts/attachments/list",
  async (request, context) => {
    const { draftId } = composeDraftParams.parse(await context.params);
    const result = await request.emailProvider.getDraftAttachments(draftId);
    if (!result)
      return NextResponse.json(
        { error: "Draft not found.", code: "DRAFT_NOT_FOUND" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    return NextResponse.json(result satisfies GetDraftAttachmentsResponse, {
      headers: { "Cache-Control": "no-store" },
    });
  },
);

/**
 * Adds a file smaller than the direct upload limit. The body is the raw file;
 * it passes through to the provider and is never stored here. Larger files
 * use an upload session instead, so no request nears the platform body cap.
 */
export const POST = withEmailProvider(
  "user/drafts/attachments/add",
  async (request, context) => {
    const { draftId } = composeDraftParams.parse(await context.params);
    const params = request.nextUrl.searchParams;
    const metadata = draftAttachmentMetadataSchema.parse({
      id: params.get("id"),
      filename: params.get("filename"),
      mimeType: params.get("mimeType"),
      size: Number(params.get("size")),
      disposition: params.get("disposition"),
      contentId: params.get("contentId") ?? undefined,
    });
    const content = await readRequestBytes(
      request,
      DRAFT_ATTACHMENT_DIRECT_UPLOAD_LIMIT_BYTES - 1,
    );
    if (!content)
      throw new SafeError(
        "This file is too large to attach in one request.",
        413,
      );
    if (content.byteLength !== metadata.size)
      throw new SafeError("The uploaded file is incomplete.");
    const result = await request.emailProvider.addDraftAttachment(draftId, {
      ...metadata,
      content: Buffer.from(content),
    });
    return NextResponse.json(result satisfies AddDraftAttachmentResponse);
  },
);
