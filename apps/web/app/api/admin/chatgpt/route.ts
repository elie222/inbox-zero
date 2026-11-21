import { NextResponse } from "next/server";
import { env } from "@/env";
import { withAdmin } from "@/utils/middleware";
import { getChatGptStatus } from "@/utils/llms/chatgpt/connection";
import { getChatGptRedirectUri } from "@/utils/llms/chatgpt/oauth";

export type GetChatGptConnectionResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAdmin("admin/chatgpt", async () =>
  NextResponse.json(await getData()),
);

async function getData() {
  return {
    reachableFromBrowser: !!getChatGptRedirectUri(env.NEXT_PUBLIC_BASE_URL),
    ...(env.CHATGPT_PLAN_ENABLED
      ? await getChatGptStatus()
      : { connected: false, email: null }),
  };
}
