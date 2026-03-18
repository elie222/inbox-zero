import type { NextRequest } from "next/server";
import prisma from "@/utils/prisma";
import { hashApiKey } from "@/utils/api-key";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";
import type { RequestWithLogger } from "@/utils/middleware";
import type { ApiKeyScopeValue } from "@/utils/api-key-scopes";

export const API_KEY_HEADER = "API-Key";

export type AccountApiKeyPrincipal = {
  apiKeyId: string;
  userId: string;
  emailAccountId: string;
  email: string;
  provider: string;
  accountId: string;
  scopes: ApiKeyScopeValue[];
};

export type StatsApiKeyPrincipal = {
  apiKeyId: string;
  userId: string;
  accountId: string;
  emailAccountId: string;
  provider: string;
  scopes: ApiKeyScopeValue[];
  authType: "account-scoped";
};

export async function validateApiKey(
  request: NextRequest,
  options?: {
    requiredScopes?: ApiKeyScopeValue[];
  },
) {
  const apiKey = request.headers.get(API_KEY_HEADER);

  if (!apiKey) throw new SafeError("Missing API key", 401);

  const storedApiKey = await getStoredApiKey(apiKey);

  if (!storedApiKey || isExpired(storedApiKey.expiresAt)) {
    throw new SafeError("Invalid API key", 401);
  }

  if (options?.requiredScopes?.length) {
    const hasAllScopes = options.requiredScopes.every((scope) =>
      storedApiKey.scopes.includes(scope),
    );

    if (!hasAllScopes) {
      throw new SafeError("API key does not have required permissions", 403);
    }
  }

  await prisma.apiKey
    .update({
      where: { id: storedApiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return { apiKey: storedApiKey };
}

export async function getUserFromApiKey(secretKey: string) {
  const storedApiKey = await getStoredApiKey(secretKey);

  if (
    !storedApiKey ||
    isExpired(storedApiKey.expiresAt) ||
    !storedApiKey.emailAccountId
  ) {
    return null;
  }

  return {
    id: storedApiKey.userId,
    emailAccountId: storedApiKey.emailAccountId,
    scopes: storedApiKey.scopes,
  };
}

export async function validateAccountApiKey(
  request: NextRequest,
  requiredScopes: ApiKeyScopeValue[],
): Promise<AccountApiKeyPrincipal> {
  const { apiKey } = await validateApiKey(request, { requiredScopes });

  if (!apiKey.emailAccountId || !apiKey.emailAccount) {
    throw new SafeError("Account-scoped API key required", 403);
  }

  return {
    apiKeyId: apiKey.id,
    userId: apiKey.userId,
    emailAccountId: apiKey.emailAccount.id,
    email: apiKey.emailAccount.email,
    provider: apiKey.emailAccount.account.provider,
    accountId: apiKey.emailAccount.account.id,
    scopes: apiKey.scopes,
  };
}

/**
 * Validates an API key and gets an email provider for the associated inbox.
 */
export async function validateApiKeyAndGetEmailProvider(
  request: RequestWithLogger,
): Promise<StatsApiKeyPrincipal & { emailProvider: EmailProvider }> {
  const accountPrincipal = await validateAccountApiKey(request, ["STATS_READ"]);

  const emailProvider = await createEmailProvider({
    emailAccountId: accountPrincipal.emailAccountId,
    provider: accountPrincipal.provider,
    logger: request.logger,
  });

  return {
    apiKeyId: accountPrincipal.apiKeyId,
    userId: accountPrincipal.userId,
    accountId: accountPrincipal.accountId,
    emailAccountId: accountPrincipal.emailAccountId,
    provider: accountPrincipal.provider,
    scopes: accountPrincipal.scopes,
    emailProvider,
    authType: "account-scoped",
  };
}

async function getStoredApiKey(secretKey: string) {
  const hashedKey = hashApiKey(secretKey);

  return prisma.apiKey.findUnique({
    where: { hashedKey, isActive: true },
    select: {
      id: true,
      userId: true,
      emailAccountId: true,
      expiresAt: true,
      scopes: true,
      emailAccount: {
        select: {
          id: true,
          email: true,
          account: {
            select: {
              id: true,
              provider: true,
            },
          },
        },
      },
    },
  });
}

function isExpired(expiresAt: Date | null): boolean {
  return !!expiresAt && expiresAt <= new Date();
}
