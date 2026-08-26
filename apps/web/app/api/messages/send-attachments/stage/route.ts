import { NextResponse } from "next/server";
import {
  EmailAttachmentStageConflictError,
  EmailAttachmentStageUnavailableError,
  stageEmailAttachments,
} from "@/utils/email/email-attachment-staging";
import { stageEmailAttachmentsBody } from "@/utils/email/email-attachment-staging.validation";
import { withEmailAccount } from "@/utils/middleware";

export type StageEmailAttachmentsResponse = Awaited<ReturnType<typeof getData>>;

export const POST = withEmailAccount(
  "messages/send-attachments/stage",
  async (request) => {
    const input = stageEmailAttachmentsBody.parse(await request.json());
    try {
      const result = await getData(request.auth.emailAccountId, input);
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof EmailAttachmentStageUnavailableError) {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
      if (error instanceof EmailAttachmentStageConflictError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }
  },
);

async function getData(
  emailAccountId: string,
  input: Parameters<typeof stageEmailAttachments>[0]["input"],
) {
  return stageEmailAttachments({ emailAccountId, input });
}
