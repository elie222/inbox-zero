import { NextResponse } from "next/server";
import { z } from "zod";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { withError } from "@/utils/middleware";
import { consumeMobileAuthCode } from "@/utils/mobile-auth/oauth-code";
import { buildMobileSessionCookie } from "@/utils/mobile-auth/session-cookie";

const exchangeCodeSchema = z.object({
  code: z.string().trim().min(1).max(256),
  state: z.string().trim().min(1).max(256),
});

export const POST = withError("mobile-auth/exchange-code", async (request) => {
  const body = exchangeCodeSchema.parse(await request.json());

  const [{ userId }, authContext] = await Promise.all([
    consumeMobileAuthCode({ code: body.code, state: body.state }),
    betterAuthConfig.$context,
  ]);

  const session = await authContext.internalAdapter.createSession(
    userId,
    false,
    {},
  );
  if (!session?.token || !session.expiresAt) {
    throw new SafeError("Failed to create mobile session", 500);
  }

  const sessionCookie = await buildMobileSessionCookie({
    authContext,
    expiresAt: session.expiresAt,
    sessionToken: session.token,
  });

  request.logger.info("Exchanged mobile auth code", {
    userId,
  });

  const response = NextResponse.json({ success: true });
  response.cookies.set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.options,
  );
  response.headers.set("Cache-Control", "no-store");

  return response;
});
