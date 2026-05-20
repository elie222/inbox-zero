import { createHmac, randomBytes } from "node:crypto";
import { env } from "@/env";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

const MOBILE_AUTH_IDENTIFIER_PREFIX = "mobile-auth";
const MOBILE_AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const MOBILE_AUTH_STATE_REGEX = /^[A-Za-z0-9._~-]{16,256}$/u;

export function isValidMobileAuthState(state: string): boolean {
  return MOBILE_AUTH_STATE_REGEX.test(state);
}

export async function createMobileAuthCode(input: {
  state: string;
  userId: string;
}): Promise<string> {
  if (!isValidMobileAuthState(input.state)) {
    throw new SafeError("Invalid authentication state", 400);
  }

  await deleteExpiredMobileAuthCodes();

  const code = randomBytes(32).toString("base64url");
  await prisma.verificationToken.create({
    data: {
      expires: new Date(Date.now() + MOBILE_AUTH_CODE_TTL_MS),
      identifier: createIdentifier({
        state: input.state,
        userId: input.userId,
      }),
      token: hashMobileAuthCode(code),
    },
  });

  return code;
}

export async function consumeMobileAuthCode(input: {
  code: string;
  state: string;
}): Promise<{ userId: string }> {
  if (!isValidMobileAuthState(input.state)) {
    throw new SafeError("Invalid authentication state", 400);
  }

  const token = hashMobileAuthCode(input.code);
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!record || record.expires <= new Date()) {
    throw new SafeError("Invalid or expired authentication code", 401);
  }

  const parsedIdentifier = parseIdentifier(record.identifier);
  if (!parsedIdentifier || parsedIdentifier.state !== input.state) {
    throw new SafeError("Invalid authentication state", 401);
  }

  const deleted = await prisma.verificationToken.deleteMany({
    where: {
      expires: { gt: new Date() },
      identifier: record.identifier,
      token,
    },
  });

  if (deleted.count !== 1) {
    throw new SafeError("Invalid or expired authentication code", 401);
  }

  return { userId: parsedIdentifier.userId };
}

async function deleteExpiredMobileAuthCodes() {
  await prisma.verificationToken.deleteMany({
    where: {
      expires: { lt: new Date() },
      identifier: {
        startsWith: `${MOBILE_AUTH_IDENTIFIER_PREFIX}:`,
      },
    },
  });
}

function createIdentifier(input: { state: string; userId: string }): string {
  return `${MOBILE_AUTH_IDENTIFIER_PREFIX}:${input.state}:${input.userId}`;
}

function parseIdentifier(
  identifier: string,
): { state: string; userId: string } | null {
  const [prefix, state, ...userIdParts] = identifier.split(":");
  const userId = userIdParts.join(":");

  if (prefix !== MOBILE_AUTH_IDENTIFIER_PREFIX || !state || !userId) {
    return null;
  }

  return { state, userId };
}

function hashMobileAuthCode(code: string): string {
  const secret = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Auth secret is required");

  return createHmac("sha256", secret).update(code).digest("base64url");
}
