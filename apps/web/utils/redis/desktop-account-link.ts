import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { env } from "@/env";
import { mobileAuthCodeChallengeSchema } from "@/utils/mobile-auth/pkce";
import { redis } from "@/utils/redis";

const DESKTOP_ACCOUNT_LINK_HANDOFF_TTL_SECONDS = 5 * 60;

const handoffSchema = z.object({
  provider: z.enum(["google", "microsoft"]),
  providerCode: z.string().min(1),
  userId: z.string().min(1),
  codeChallenge: mobileAuthCodeChallengeSchema,
  stateNonce: z.string().min(1),
  reconnectEmailAccountId: z.string().nullable(),
});

export type DesktopAccountLinkHandoff = z.infer<typeof handoffSchema>;

// Derived from the provider code so a browser that repeats the callback request
// hands the app the same code, which the app then ignores as already handled.
export async function storeDesktopAccountLinkHandoff(
  handoff: DesktopAccountLinkHandoff,
): Promise<string> {
  const code = createHmac("sha256", getHandoffSecret())
    .update(`desktop-account-link:${handoff.providerCode}`)
    .digest("base64url");
  await redis.set(getHandoffKey(code), handoffSchema.parse(handoff), {
    ex: DESKTOP_ACCOUNT_LINK_HANDOFF_TTL_SECONDS,
    nx: true,
  });
  return code;
}

export async function consumeDesktopAccountLinkHandoff(
  code: string,
): Promise<DesktopAccountLinkHandoff | null> {
  const value = await redis.getdel(getHandoffKey(code));
  const parsed = handoffSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function getHandoffKey(code: string) {
  return `desktop-account-link:${createHash("sha256").update(code).digest("hex")}`;
}

function getHandoffSecret() {
  const secret = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Auth secret is required");
  return secret;
}
