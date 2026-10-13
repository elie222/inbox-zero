import { z } from "zod";
import { withAccountApiKey } from "@/utils/api-middleware";
import { createEmailProvider } from "@/utils/email/provider";
import { SafeError } from "@/utils/error";
import {
  getDeliveryAttachment,
  MAX_DELIVERY_ATTACHMENT_BYTES,
} from "@/utils/ai/assistant/attachment-delivery";

const querySchema = z.object({
  messageId: z.string().trim().min(1),
  attachmentId: z.string().trim().min(1),
});

export const maxDuration = 120;

export const GET = withAccountApiKey(
  "v1/assistant/attachment",
  ["ASSISTANT_CHAT"],
  async (request) => {
    const { messageId, attachmentId } = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const provider = await createEmailProvider({
      emailAccountId: request.apiAuth.emailAccountId,
      provider: request.apiAuth.provider,
      logger: request.logger,
    });
    const metadata = await getDeliveryAttachment(
      provider,
      messageId,
      attachmentId,
    );
    const attachment = await provider.getAttachment(messageId, attachmentId);
    const bytes = Buffer.from(attachment.data, "base64");
    if (bytes.length > MAX_DELIVERY_ATTACHMENT_BYTES)
      throw new SafeError("Attachment exceeds the 20 MB delivery limit", 413);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(metadata.filename.toWellFormed()).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
