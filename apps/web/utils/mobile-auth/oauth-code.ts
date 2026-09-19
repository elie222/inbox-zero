import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "@/env";
import { secureCompare } from "@/utils/crypto-compare";
import { mobileAuthProviderSchema } from "@/utils/mobile-auth/providers";
import { SafeError } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import {
  getMobileAuthCodeChallenge,
  mobileAuthCodeChallengeSchema,
  mobileAuthCodeVerifierSchema,
} from "@/utils/mobile-auth/pkce";
import { MOBILE_AUTH_RETURN_URL_MODES } from "@/utils/mobile-auth/url";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("mobile-auth/oauth-code");
const MOBILE_AUTH_TOKEN_TTL_MS = 5 * 60 * 1000;
const stateSchema = z.object({
  returnUrlMode: z.enum(MOBILE_AUTH_RETURN_URL_MODES),
  codeChallenge: mobileAuthCodeChallengeSchema,
  provider: mobileAuthProviderSchema,
  completionHash: z.string().min(1),
  sessionHash: z.string().optional(),
});
const codeSchema = z.object({
  state: z.string(),
  userId: z.string().min(1),
  codeChallenge: mobileAuthCodeChallengeSchema,
});

export function createMobileAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function isValidMobileAuthState(state: string): boolean {
  return /^[A-Za-z0-9._~-]{16,256}$/u.test(state);
}

export async function storeMobileAuthState(
  input: Omit<z.infer<typeof stateSchema>, "completionHash" | "sessionHash"> & {
    state: string;
    completionToken: string;
  },
): Promise<void> {
  assertState(input.state);
  const data = stateSchema.parse({
    ...input,
    completionHash: hashToken("completion", input.completionToken),
  });
  await storeToken("state", input.state, data);
}

// Called only from the successful provider callback hook, never from a browser session lookup.
export async function completeMobileAuthState(input: {
  state: string;
  provider: string;
  completionToken: string;
  sessionToken: string;
}): Promise<void> {
  assertState(input.state);
  const token = hashToken("state", input.state);
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });
  const data = parseRecord(record?.identifier, "state", stateSchema);
  if (
    !record ||
    !data ||
    record.expires <= new Date() ||
    data.sessionHash ||
    data.provider !== input.provider ||
    !secureCompare(
      data.completionHash,
      hashToken("completion", input.completionToken),
    )
  ) {
    throw new SafeError("Invalid authentication state", 401);
  }
  const updated = await prisma.verificationToken.updateMany({
    where: {
      token,
      identifier: record.identifier,
      expires: { gt: new Date() },
    },
    data: {
      identifier: identifier("state", {
        ...data,
        sessionHash: hashToken("session", input.sessionToken),
      }),
    },
  });
  if (updated.count !== 1)
    throw new SafeError("Invalid authentication state", 401);
}

export async function consumeMobileAuthState(input: {
  state: string;
  sessionToken: string;
}) {
  assertState(input.state);
  const token = hashToken("state", input.state);
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });
  const data = parseRecord(record?.identifier, "state", stateSchema);
  if (
    !record ||
    !data ||
    record.expires <= new Date() ||
    !data.sessionHash ||
    !input.sessionToken ||
    !secureCompare(data.sessionHash, hashToken("session", input.sessionToken))
  ) {
    throw new SafeError("Invalid authentication state", 401);
  }
  await consumeToken(token, record.identifier, "Invalid authentication state");
  return {
    returnUrlMode: data.returnUrlMode,
    codeChallenge: data.codeChallenge,
  };
}

export async function consumeMobileAuthFailureState(input: { state: string }) {
  assertState(input.state);
  const token = hashToken("state", input.state);
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });
  const data = parseRecord(record?.identifier, "state", stateSchema);
  if (!record || !data || record.expires <= new Date() || data.sessionHash) {
    throw new SafeError("Invalid authentication state", 401);
  }
  await consumeToken(token, record.identifier, "Invalid authentication state");
  return { returnUrlMode: data.returnUrlMode };
}

export async function createMobileAuthCode(
  input: z.infer<typeof codeSchema>,
): Promise<string> {
  assertState(input.state);
  const data = codeSchema.parse(input);
  const code = randomBytes(32).toString("base64url");
  await storeToken("code", code, data);
  return code;
}

export async function consumeMobileAuthCode(input: {
  code: string;
  state: string;
  codeVerifier: string;
}): Promise<{ userId: string }> {
  assertState(input.state);
  const token = hashToken("code", input.code);
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });
  const data = parseRecord(record?.identifier, "code", codeSchema);
  if (
    !record ||
    !data ||
    record.expires <= new Date() ||
    data.state !== input.state ||
    !mobileAuthCodeVerifierSchema.safeParse(input.codeVerifier).success ||
    !secureCompare(
      getMobileAuthCodeChallenge(input.codeVerifier),
      data.codeChallenge,
    )
  ) {
    throw new SafeError("Invalid or expired authentication code", 401);
  }
  await consumeToken(
    token,
    record.identifier,
    "Invalid or expired authentication code",
  );
  return { userId: data.userId };
}

function assertState(state: string) {
  if (!isValidMobileAuthState(state))
    throw new SafeError("Invalid authentication state", 400);
}

function identifier(scope: "state" | "code", data: unknown) {
  return `mobile-auth-${scope}:${JSON.stringify(data)}`;
}

function parseRecord<T>(
  value: string | undefined,
  scope: "state" | "code",
  schema: z.ZodType<T>,
): T | null {
  const prefix = `mobile-auth-${scope}:`;
  if (!value?.startsWith(prefix)) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(value.slice(prefix.length)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function storeToken(
  scope: "state" | "code",
  value: string,
  data: unknown,
) {
  deleteExpiredTokens().catch(() => undefined);
  await prisma.verificationToken.create({
    data: {
      token: hashToken(scope, value),
      identifier: identifier(scope, data),
      expires: new Date(Date.now() + MOBILE_AUTH_TOKEN_TTL_MS),
    },
  });
}

async function consumeToken(token: string, value: string, message: string) {
  const deleted = await prisma.verificationToken.deleteMany({
    where: { token, identifier: value, expires: { gt: new Date() } },
  });
  if (deleted.count !== 1) throw new SafeError(message, 401);
}

async function deleteExpiredTokens() {
  try {
    await prisma.verificationToken.deleteMany({
      where: {
        expires: { lte: new Date() },
        OR: [
          { identifier: { startsWith: "mobile-auth-state:" } },
          { identifier: { startsWith: "mobile-auth-code:" } },
          { identifier: { startsWith: "mobile-auth:" } },
        ],
      },
    });
  } catch (error) {
    logger.error("Failed to sweep expired mobile auth tokens", { error });
  }
}

function hashToken(
  scope: "code" | "state" | "session" | "completion",
  value: string,
): string {
  const secret = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Auth secret is required");
  return createHmac("sha256", secret)
    .update(`${scope}:${value}`)
    .digest("base64url");
}
