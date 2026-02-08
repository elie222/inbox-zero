import { z } from "zod";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import {
  RedirectError,
  redirectWithMessage,
  redirectWithError,
} from "@/utils/oauth/redirect";
import { verifyEmailAccountAccess } from "@/utils/oauth/verify";
import { SLACK_STATE_COOKIE_NAME } from "./constants";
import prisma from "@/utils/prisma";
import { parseOAuthState } from "@/utils/oauth/state";
import { prefixPath } from "@/utils/path";
import { MessagingProvider } from "@/generated/prisma/enums";

const slackOAuthStateSchema = z.object({
  emailAccountId: z.string().min(1).max(64),
  type: z.literal("slack"),
  nonce: z.string().min(8).max(128),
});

const slackOAuthResponseSchema = z.object({
  ok: z.literal(true),
  access_token: z.string().min(1),
  bot_user_id: z.string().min(1),
  team: z.object({
    id: z.string().min(1),
    name: z.string(),
  }),
});

type SlackOAuthResponse = z.infer<typeof slackOAuthResponseSchema>;

export async function handleSlackCallback(
  request: NextRequest,
  logger: Logger,
): Promise<NextResponse> {
  let redirectHeaders = new Headers();

  try {
    const { code, redirectUrl, response } = validateOAuthCallback(
      request,
      logger,
    );
    redirectHeaders = response.headers;

    const receivedState = request.nextUrl.searchParams.get("state");
    if (!receivedState) {
      throw new Error("Missing validated state");
    }

    const decodedState = parseAndValidateSlackState(
      receivedState,
      logger,
      redirectUrl,
      response.headers,
    );

    const { emailAccountId } = decodedState;

    const finalRedirectUrl = buildSettingsRedirectUrl(emailAccountId);

    // When WEBHOOK_URL differs from NEXT_PUBLIC_BASE_URL, the session cookie
    // won't be sent to the callback domain. Skip session-based ownership check
    // in that case — the auth-url endpoint (protected by withEmailAccount)
    // already verified ownership before generating this state.
    const webhookDiffers =
      env.WEBHOOK_URL && env.WEBHOOK_URL !== env.NEXT_PUBLIC_BASE_URL;

    if (!webhookDiffers) {
      await verifyEmailAccountAccess(
        emailAccountId,
        logger,
        finalRedirectUrl,
        response.headers,
      );
    }

    const tokens = await exchangeCodeForTokens(code);

    await upsertMessagingChannel({
      teamId: tokens.team.id,
      teamName: tokens.team.name,
      accessToken: tokens.access_token,
      providerUserId: tokens.bot_user_id,
      emailAccountId,
    });

    logger.info("Slack connected successfully", {
      emailAccountId,
      teamId: tokens.team.id,
      teamName: tokens.team.name,
    });

    return redirectWithMessage(
      finalRedirectUrl,
      "slack_connected",
      redirectHeaders,
    );
  } catch (error) {
    if (error instanceof RedirectError) {
      return redirectWithError(
        error.redirectUrl,
        "connection_failed",
        error.responseHeaders,
      );
    }

    logger.error("Error in Slack callback", { error });

    // Best-effort: try to extract emailAccountId from the state param for a
    // proper account-scoped redirect. Fall back to prefix-less /settings which
    // the (redirects) page will handle.
    let errorPath = "/settings";
    try {
      const state = request.nextUrl.searchParams.get("state");
      if (state) {
        const parsed = parseOAuthState<{ emailAccountId?: string }>(state);
        if (parsed?.emailAccountId) {
          errorPath = prefixPath(parsed.emailAccountId, "/settings");
        }
      }
    } catch {
      // Ignore — use fallback path
    }

    const errorRedirectUrl = new URL(errorPath, env.NEXT_PUBLIC_BASE_URL);
    errorRedirectUrl.searchParams.set("tab", "email");
    errorRedirectUrl.searchParams.set("error", "connection_failed");
    return NextResponse.redirect(errorRedirectUrl, {
      headers: redirectHeaders,
    });
  }
}

function validateOAuthCallback(
  request: NextRequest,
  logger: Logger,
): {
  code: string;
  redirectUrl: URL;
  response: NextResponse;
} {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const receivedState = searchParams.get("state");
  const storedState = request.cookies.get(SLACK_STATE_COOKIE_NAME)?.value;

  const redirectUrl = new URL("/settings", env.NEXT_PUBLIC_BASE_URL);
  redirectUrl.searchParams.set("tab", "email");
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.delete(SLACK_STATE_COOKIE_NAME);

  if (!code || code.length < 10) {
    logger.warn("Missing or invalid code in Slack callback");
    redirectUrl.searchParams.set("error", "missing_code");
    throw new RedirectError(redirectUrl, response.headers);
  }

  // When WEBHOOK_URL differs from NEXT_PUBLIC_BASE_URL, the state cookie
  // won't be sent to the callback domain. Skip the cookie check — the state
  // is still validated structurally via parseAndValidateSlackState.
  const webhookDiffers =
    env.WEBHOOK_URL && env.WEBHOOK_URL !== env.NEXT_PUBLIC_BASE_URL;

  if (
    !webhookDiffers &&
    (!storedState || !receivedState || storedState !== receivedState)
  ) {
    logger.warn("Invalid state during Slack callback", {
      receivedState,
      hasStoredState: !!storedState,
    });
    redirectUrl.searchParams.set("error", "invalid_state");
    throw new RedirectError(redirectUrl, response.headers);
  }

  return { code, redirectUrl, response };
}

function parseAndValidateSlackState(
  storedState: string,
  logger: Logger,
  redirectUrl: URL,
  responseHeaders: Headers,
) {
  let rawState: unknown;
  try {
    rawState = parseOAuthState<{
      emailAccountId: string;
      type: "slack";
    }>(storedState);
  } catch (error) {
    logger.error("Failed to decode state", { error });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    throw new RedirectError(redirectUrl, responseHeaders);
  }

  const validationResult = slackOAuthStateSchema.safeParse(rawState);
  if (!validationResult.success) {
    logger.error("State validation failed", {
      errors: validationResult.error.errors,
    });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    throw new RedirectError(redirectUrl, responseHeaders);
  }

  return validationResult.data;
}

function buildSettingsRedirectUrl(emailAccountId: string): URL {
  const url = new URL(
    prefixPath(emailAccountId, "/settings"),
    env.NEXT_PUBLIC_BASE_URL,
  );
  url.searchParams.set("tab", "email");
  return url;
}

async function exchangeCodeForTokens(
  code: string,
): Promise<SlackOAuthResponse> {
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID!,
      client_secret: env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/slack/callback`,
    }),
  });

  const raw = await response.json();

  if (!raw.ok) {
    throw new Error(`Slack OAuth error: ${raw.error}`);
  }

  const result = slackOAuthResponseSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid Slack OAuth response: ${result.error.issues.map((i) => i.message).join(", ")}`,
    );
  }

  return result.data;
}

async function upsertMessagingChannel(params: {
  teamId: string;
  teamName: string;
  accessToken: string;
  providerUserId: string;
  emailAccountId: string;
}) {
  return prisma.messagingChannel.upsert({
    where: {
      emailAccountId_provider_teamId: {
        emailAccountId: params.emailAccountId,
        provider: MessagingProvider.SLACK,
        teamId: params.teamId,
      },
    },
    update: {
      teamName: params.teamName,
      accessToken: params.accessToken,
      providerUserId: params.providerUserId,
      isConnected: true,
    },
    create: {
      provider: MessagingProvider.SLACK,
      teamId: params.teamId,
      teamName: params.teamName,
      accessToken: params.accessToken,
      providerUserId: params.providerUserId,
      emailAccountId: params.emailAccountId,
      isConnected: true,
    },
  });
}
