import { NextResponse } from "next/server";
import { getComposeSignature } from "@/utils/email/compose-signature";
import { withEmailAccount } from "@/utils/middleware";

export type GetSignatureResponse = Awaited<
  ReturnType<typeof getComposeSignature>
>;

export const GET = withEmailAccount("user/signature", async (request) => {
  const { emailAccountId, userId } = request.auth;
  const result = await getComposeSignature({ emailAccountId, userId });
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
});
