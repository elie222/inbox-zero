"use server";

import {
  createApiKeyBody,
  deactivateApiKeyBody,
} from "@/utils/actions/api-key.validation";
import prisma from "@/utils/prisma";
import { generateSecureToken, hashApiKey } from "@/utils/api-key";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { env } from "@/env";
import type { ApiKeyExpiryValue } from "@/utils/api-key-scopes";

export const createApiKeyAction = actionClient
  .metadata({ name: "createApiKey" })
  .inputSchema(createApiKeyBody)
  .action(
    async ({
      ctx: { userId, emailAccountId },
      parsedInput: { name, scopes, expiresIn },
    }) => {
      if (!env.NEXT_PUBLIC_EXTERNAL_API_ENABLED) {
        throw new SafeError("External API is not enabled");
      }
      const secretKey = generateSecureToken();
      const hashedKey = hashApiKey(secretKey);

      await prisma.apiKey.create({
        data: {
          userId,
          emailAccountId,
          name: name || "Management key",
          hashedKey,
          isActive: true,
          scopes,
          expiresAt: getApiKeyExpiryDate(expiresIn),
        },
      });

      return { secretKey };
    },
  );

export const deactivateApiKeyAction = actionClient
  .metadata({ name: "deactivateApiKey" })
  .inputSchema(deactivateApiKeyBody)
  .action(async ({ ctx: { userId, emailAccountId }, parsedInput: { id } }) => {
    await prisma.apiKey.update({
      where: { id, userId, emailAccountId },
      data: { isActive: false },
    });
  });

function getApiKeyExpiryDate(expiresIn: ApiKeyExpiryValue): Date | null {
  if (expiresIn === "never") return null;

  const days = Number.parseInt(expiresIn, 10);
  if (Number.isNaN(days)) return null;

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + days);
  return expiryDate;
}
