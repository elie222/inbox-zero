import type { NextRequest } from "next/server";
import prisma from "@/utils/prisma";
import { hashApiKey } from "@/utils/api-key";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";

export const API_KEY_HEADER = "API-Key";

/**
 * Validates an API key from the request headers and returns the associated user
 * @param request The Next.js request object
 * @returns The user object or null if the API key is invalid or missing
 * @throws SafeError if the API key is invalid or missing
 */
export async function validateApiKey(request: NextRequest) {
  const apiKey = request.headers.get(API_KEY_HEADER);

  if (!apiKey) throw new SafeError("Missing API key", 401);

  const user = await getUserFromApiKey(apiKey);

  if (!user) throw new SafeError("Invalid API key", 401);

  return { user };
}

/**
 * Gets a user from an API key
 * @param secretKey The API key to validate
 * @returns The user object or null if the API key is invalid
 */
export async function getUserFromApiKey(secretKey: string) {
  const hashedKey = hashApiKey(secretKey);

  const result = await prisma.apiKey.findUnique({
    where: { hashedKey, isActive: true },
    select: {
      user: {
        select: {
          id: true,
          accounts: {
            select: {
              id: true,
              access_token: true,
              refresh_token: true,
              expires_at: true,
              provider: true,
            },
            take: 1,
          },
        },
      },
      isActive: true,
    },
  });

  return result?.user || null;
}

/**
 * Validates an API key and gets a Gmail client for the user
 * @param request The Next.js request object
 * @returns The Gmail client and user ID
 * @throws SafeError if authentication fails
 */
export async function validateApiKeyAndGetEmailProvider(request: NextRequest) {
  const { user } = await validateApiKey(request);

  // TODO: support API For multiple accounts
  const account = user.accounts[0];

  if (!account) throw new SafeError("Missing account", 401);

  if (!account.access_token || !account.refresh_token || !account.expires_at)
    throw new SafeError("Missing access token", 401);

  const emailProvider = await createEmailProvider({
    emailAccountId: account.id,
    provider: account.provider,
  });

  return {
    emailProvider,
    userId: user.id,
    accountId: account.id,
  };
}
