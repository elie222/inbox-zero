/**
 * Example Prisma-based storage implementation
 *
 * This shows how to implement the CredentialStorage interface using Prisma.
 * Adapt this to your own database schema.
 *
 * NOTE: This is an example file. Uncomment the prisma import and adapt to your schema.
 */

// biome-ignore-all lint: Example file with placeholder code

import type {
  CredentialStorage,
  ClientCredentials,
  ConnectionCredentials,
} from "@inboxzero/mcp";

// Assuming you have these Prisma models:
//
// model McpIntegration {
//   id               String   @id @default(cuid())
//   name             String   @unique
//   oauthClientId    String?
//   oauthClientSecret String?
//   // ... other fields
// }
//
// model McpConnection {
//   id           String   @id @default(cuid())
//   userId       String
//   integration  String
//   accessToken  String?
//   refreshToken String?
//   apiKey       String?
//   expiresAt    DateTime?
//   // ... other fields
//   @@unique([userId, integration])
// }

// import prisma from '@/lib/prisma';

export class PrismaCredentialStorage implements CredentialStorage {
  async getClientCredentials(
    integration: string,
  ): Promise<ClientCredentials | null> {
    const mcpIntegration = await prisma.mcpIntegration.findUnique({
      where: { name: integration },
    });

    if (!mcpIntegration?.oauthClientId) {
      return null;
    }

    return {
      clientId: mcpIntegration.oauthClientId,
      clientSecret: mcpIntegration.oauthClientSecret || undefined,
      isDynamic: true,
    };
  }

  async storeClientCredentials(
    integration: string,
    credentials: ClientCredentials,
  ): Promise<void> {
    // Update the integration with OAuth client credentials
    await prisma.mcpIntegration.update({
      where: { name: integration },
      data: {
        oauthClientId: credentials.clientId,
        oauthClientSecret: credentials.clientSecret,
      },
    });
  }

  async getConnectionCredentials(
    integration: string,
    userId: string,
  ): Promise<ConnectionCredentials | null> {
    const connection = await prisma.mcpConnection.findUnique({
      where: {
        userId_integration: {
          userId,
          integration,
        },
      },
    });

    if (!connection) {
      return null;
    }

    return {
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      apiKey: connection.apiKey,
      expiresAt: connection.expiresAt,
    };
  }

  async storeConnectionCredentials(
    integration: string,
    userId: string,
    credentials: ConnectionCredentials,
  ): Promise<void> {
    await prisma.mcpConnection.create({
      data: {
        userId,
        integration,
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        apiKey: credentials.apiKey,
        expiresAt: credentials.expiresAt,
      },
    });
  }

  async updateConnectionCredentials(
    integration: string,
    userId: string,
    credentials: Partial<ConnectionCredentials>,
  ): Promise<void> {
    await prisma.mcpConnection.update({
      where: {
        userId_integration: {
          userId,
          integration,
        },
      },
      data: {
        accessToken: credentials.accessToken ?? undefined,
        refreshToken: credentials.refreshToken ?? undefined,
        apiKey: credentials.apiKey ?? undefined,
        expiresAt: credentials.expiresAt ?? undefined,
        updatedAt: new Date(),
      },
    });
  }
}

// Export singleton instance
export const storage = new PrismaCredentialStorage();
