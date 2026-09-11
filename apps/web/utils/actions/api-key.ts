"use server";

import {
  createApiKeyBody,
  deactivateApiKeyBody,
  updateMcpServerAccessBody,
} from "@/utils/actions/api-key.validation";
import prisma from "@/utils/prisma";
import { generateSecureToken, hashApiKey } from "@/utils/api-key";
import { actionClient, actionClientUser } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { env } from "@/env";
import { isMcpServerAvailable } from "@/utils/mcp/config";
import type { ApiKeyExpiryValue } from "@/utils/api-key-scopes";

const apiKeyActionClient = actionClient.use(async ({ ctx, next }) => {
  if (ctx.session.session.emailOtp) {
    throw new SafeError(
      "Sign in with your connected provider to manage API keys.",
    );
  }
  return next();
});

export const createApiKeyAction = apiKeyActionClient
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

export const deactivateApiKeyAction = apiKeyActionClient
  .metadata({ name: "deactivateApiKey" })
  .inputSchema(deactivateApiKeyBody)
  .action(async ({ ctx: { userId, emailAccountId }, parsedInput: { id } }) => {
    await prisma.apiKey.update({
      where: { id, userId, emailAccountId },
      data: { isActive: false },
    });
  });

export const updateMcpServerAccessAction = actionClientUser
  .metadata({ name: "updateMcpServerAccess" })
  .inputSchema(updateMcpServerAccessBody)
  .action(async ({ ctx: { userId, session }, parsedInput: { enabled } }) => {
    if (session.session.emailOtp) {
      throw new SafeError(
        "Sign in with your connected provider to manage MCP access.",
      );
    }
    if (!isMcpServerAvailable()) {
      throw new SafeError("MCP server is not enabled");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          mcpServerEnabled: enabled,
          ...(!enabled && { mcpTokenVersion: { increment: 1 } }),
        },
      }),
      ...(!enabled
        ? [
            prisma.oauthAccessToken.deleteMany({ where: { userId } }),
            prisma.oauthRefreshToken.deleteMany({ where: { userId } }),
            prisma.oauthConsent.deleteMany({ where: { userId } }),
          ]
        : []),
    ]);

    return { enabled };
  });

function getApiKeyExpiryDate(expiresIn: ApiKeyExpiryValue): Date | null {
  if (expiresIn === "never") return null;

  const days = Number.parseInt(expiresIn, 10);
  if (Number.isNaN(days)) return null;

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + days);
  return expiryDate;
}
