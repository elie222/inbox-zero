import { NextResponse } from "next/server";
import { env } from "@/env";
import { SafeError } from "@/utils/error";
import { withAdmin } from "@/utils/middleware";
import { getChatGptRegistration } from "@/utils/llms/chatgpt/connection";
import {
  buildChatGptAuthorizationUrl,
  createOAuthRandomValue,
  getChatGptRedirectUri,
} from "@/utils/llms/chatgpt/oauth";
import { encodeChatGptState } from "@/utils/llms/chatgpt/state";

export type GetChatGptConnectUrlResponse = { url: string };

export const GET = withAdmin("admin/chatgpt/connect", async (request) => {
  if (!env.CHATGPT_PLAN_ENABLED) {
    throw new SafeError("Set CHATGPT_PLAN_ENABLED=true to connect ChatGPT.");
  }

  const redirectUri = getChatGptRedirectUri(env.NEXT_PUBLIC_BASE_URL);
  if (!redirectUri) {
    throw new SafeError(
      "Sign in with ChatGPT needs the app to run on this machine (NEXT_PUBLIC_BASE_URL on localhost).",
    );
  }

  const { hostId, clientId, idToken } = await getChatGptRegistration();

  const codeVerifier = createOAuthRandomValue();
  const nonce = createOAuthRandomValue();
  const state = encodeChatGptState({
    clientId,
    codeVerifier,
    nonce,
    redirectUri,
    userId: request.auth.userId,
  });
  const url = buildChatGptAuthorizationUrl({
    clientId,
    hostId,
    redirectUri,
    state,
    codeVerifier,
    nonce,
    idTokenHint: idToken,
  });

  return NextResponse.json<GetChatGptConnectUrlResponse>({ url });
});
