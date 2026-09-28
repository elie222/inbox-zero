import { NextResponse } from "next/server";
import { listNativeMailSplits } from "@/utils/mail/native-categories";
import { withEmailProvider } from "@/utils/middleware";

export type MailSplitsResponse = Awaited<
  ReturnType<typeof listNativeMailSplits>
>;

export const GET = withEmailProvider("user/mail-splits", async (request) => {
  const result = await listNativeMailSplits({
    emailAccountId: request.auth.emailAccountId,
    emailProvider: request.emailProvider,
  });
  return NextResponse.json(result);
});
