import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import { withError } from "@/utils/middleware";
import { sendEmail } from "@/utils/digest/send-digest-email";

const schema = z.object({
  emailAccountId: z.string(),
});

export const POST = withError(async (request) => {
  const session = await auth();
  if (!isAdmin({ email: session?.user.email })) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  const body = schema.parse(await request.json());
  const { emailAccountId } = body;

  // Call PRODUCTION sendEmail() function directly with force=true and testMode=true
  // This uses the EXACT same sendEmail() function as production cron
  // testMode=true keeps digests as PENDING so preview remains visible
  const result = await sendEmail({
    emailAccountId,
    force: true, // Force send even if schedule says not ready
    testMode: true, // Keep digests as PENDING for preview
  });

  return NextResponse.json({
    success: true,
    message: "Digest sent via production sendEmail() function",
    result,
  });
});
