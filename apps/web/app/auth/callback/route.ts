import { NextResponse } from "next/server";
import { env } from "@/env";
import { isAdmin } from "@/utils/admin";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { saveChatGptConnection } from "@/utils/llms/chatgpt/connection";
import {
  exchangeChatGptCode,
  hasChatGptPlanScope,
  verifyChatGptIdToken,
} from "@/utils/llms/chatgpt/oauth";
import { decodeChatGptState } from "@/utils/llms/chatgpt/state";

// Sign in with ChatGPT requires exactly this loopback path:
// https://developers.openai.com/siwc/token-sharing-open-source/sign-in
export const GET = withError("chatgpt/callback", async (request) => {
  const logger = request.logger;
  const params = request.nextUrl.searchParams;

  const redirect = (result: string) => {
    const url = new URL("/admin", env.NEXT_PUBLIC_BASE_URL);
    url.searchParams.set("chatgpt", result);
    return NextResponse.redirect(url);
  };

  if (!env.CHATGPT_PLAN_ENABLED) return redirect("disabled");

  const state = decodeChatGptState(params.get("state"));
  if (!state) {
    logger.warn("Invalid or expired ChatGPT OAuth state");
    return redirect("invalid_state");
  }

  if (params.get("error")) {
    logger.warn("ChatGPT sign-in returned an error", {
      error: params.get("error"),
    });
    return redirect(
      params.get("error") === "access_denied" ? "cancelled" : "error",
    );
  }

  const code = params.get("code");
  const callbackClientId = params.get("client_id");
  if (!code) return redirect("error");

  // A new registration issues its client ID in the callback; a returning one
  // must keep the client it started with.
  if (
    state.clientId &&
    callbackClientId &&
    callbackClientId !== state.clientId
  ) {
    logger.warn("ChatGPT callback returned a different client ID");
    return redirect("error");
  }
  const clientId = state.clientId ?? callbackClientId;
  if (!clientId) {
    logger.warn("ChatGPT registration returned no client ID");
    return redirect("error");
  }

  const user = await prisma.user.findUnique({
    where: { id: state.userId },
    select: { email: true },
  });
  if (!isAdmin({ email: user?.email })) {
    logger.warn("ChatGPT callback for a non-admin user");
    return redirect("forbidden");
  }

  try {
    const tokens = await exchangeChatGptCode({
      clientId,
      code,
      codeVerifier: state.codeVerifier,
      redirectUri: state.redirectUri,
    });
    if (!tokens.id_token) throw new Error("Missing ID token");

    const identity = await verifyChatGptIdToken({
      idToken: tokens.id_token,
      clientId,
      nonce: state.nonce,
    });

    if (!hasChatGptPlanScope(tokens.scope)) {
      logger.warn("ChatGPT plan usage was not granted");
      return redirect("plan_not_granted");
    }

    await saveChatGptConnection({
      clientId,
      subject: identity.subject,
      email: identity.email,
      tokens,
    });
    logger.info("Connected ChatGPT");
    return redirect("connected");
  } catch (error) {
    logger.error("Failed to complete ChatGPT sign-in", { error });
    return redirect("error");
  }
});
