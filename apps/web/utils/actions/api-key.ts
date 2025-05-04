"use server";

import {
  createApiKeyBody,
  deactivateApiKeyBody,
} from "@/utils/actions/api-key.validation";
import prisma from "@/utils/prisma";
import { generateSecureToken, hashApiKey } from "@/utils/api-key";
import { actionClientUser } from "@/utils/actions/safe-action";

export const createApiKeyAction = actionClientUser
  .metadata({ name: "createApiKey" })
  .schema(createApiKeyBody)
  .action(async ({ ctx: { userId }, parsedInput: { name } }) => {
    const secretKey = generateSecureToken();
    const hashedKey = hashApiKey(secretKey);

    await prisma.apiKey.create({
      data: {
        userId,
        name: name || "Secret key",
        hashedKey,
        isActive: true,
      },
    });

    return { secretKey };
  });

export const deactivateApiKeyAction = actionClientUser
  .metadata({ name: "deactivateApiKey" })
  .schema(deactivateApiKeyBody)
  .action(async ({ ctx: { userId }, parsedInput: { id } }) => {
    await prisma.apiKey.update({
      where: { id, userId },
      data: { isActive: false },
    });
  });
