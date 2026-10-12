import { NextResponse } from "next/server";
import { z } from "zod";
import type { EmailProvider } from "@/utils/email/types";
import { withEmailProvider } from "@/utils/middleware";

export type RemoveDraftAttachmentResponse = Awaited<
  ReturnType<EmailProvider["removeDraftAttachment"]>
>;

const paramsSchema = z.object({
  draftId: z.string().min(1).max(512),
  attachmentId: z.string().min(1).max(1024),
});

export const DELETE = withEmailProvider(
  "user/drafts/attachments/remove",
  async (request, context) => {
    const { draftId, attachmentId } = paramsSchema.parse(await context.params);
    const result = await request.emailProvider.removeDraftAttachment(
      draftId,
      attachmentId,
    );
    return NextResponse.json(result satisfies RemoveDraftAttachmentResponse);
  },
);
