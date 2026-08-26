import { NextResponse } from "next/server";
import {
  completeEmailAttachments,
  EmailAttachmentStageConsumedError,
  EmailAttachmentStageIncompleteError,
  EmailAttachmentStageInvalidError,
} from "@/utils/email/email-attachment-staging";
import { completeEmailAttachmentsBody } from "@/utils/email/email-attachment-staging.validation";
import { withEmailAccount } from "@/utils/middleware";

export const POST = withEmailAccount(
  "messages/send-attachments/complete",
  async (request) => {
    const input = completeEmailAttachmentsBody.parse(await request.json());
    try {
      const result = await completeEmailAttachments({
        emailAccountId: request.auth.emailAccountId,
        input,
      });
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof EmailAttachmentStageIncompleteError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (
        error instanceof EmailAttachmentStageInvalidError ||
        error instanceof EmailAttachmentStageConsumedError
      ) {
        return NextResponse.json({ error: error.message }, { status: 410 });
      }
      throw error;
    }
  },
);
