import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { getVoiceStatus } from "@/utils/voice/runtime";

export type GetVoiceStatusResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("voice/status", async (request) => {
  const { emailAccountId } = request.auth;
  const result = await getData({ emailAccountId });
  return NextResponse.json(result);
});

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const user = await getEmailAccountWithAi({ emailAccountId });
  return getVoiceStatus(user?.user);
}
