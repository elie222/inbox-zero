import { z } from "zod";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { processPreviousSentEmails } from "@/utils/reply-tracker/check-previous-emails";
import { createScopedLogger } from "@/utils/logger";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { getEmailAccountWithAi } from "@/utils/user/get";

const logger = createScopedLogger("api/reply-tracker/process-previous");

export const maxDuration = 300;

const processPreviousSchema = z.object({ emailAccountId: z.string() });
export type ProcessPreviousBody = z.infer<typeof processPreviousSchema>;

export const POST = withError(async (request) => {
  if (!isValidInternalApiKey(await headers(), logger)) {
    return NextResponse.json({ error: "Invalid API key" });
  }

  const json = await request.json();
  const body = processPreviousSchema.parse(json);
  const emailAccountId = body.emailAccountId;

  const emailAccount = await getEmailAccountWithAi({ emailAccountId });
  if (!emailAccount) return NextResponse.json({ error: "User not found" });

  await processPreviousSentEmails({ emailAccount });

  return NextResponse.json({ success: true });
});
