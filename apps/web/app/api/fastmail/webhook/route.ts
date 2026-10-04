import { z } from "zod";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { secureCompare } from "@/utils/crypto-compare";
import { enqueueFastmailSync } from "@/utils/fastmail/queue";

const payload = z.object({
  emailAccountId: z.string().min(1),
  newState: z.string().optional(),
});
export type FastmailWebhookPayload = z.infer<typeof payload>;
export const POST = withError("fastmail/webhook", async (request) => {
  if (
    !env.FASTMAIL_WEBHOOK_SECRET ||
    !secureCompare(
      request.headers.get("authorization"),
      `Bearer ${env.FASTMAIL_WEBHOOK_SECRET}`,
    )
  )
    return new Response("Unauthorized", { status: 401 });
  const parsed = payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid payload", { status: 400 });
  await enqueueFastmailSync(parsed.data.emailAccountId);
  return Response.json({ success: true }, { status: 202 });
});
