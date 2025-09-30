import type {
  CredentialStorage,
  ClientCredentials,
  ConnectionCredentials,
} from "@inboxzero/mcp";
import prisma from "@/utils/prisma";

/**
 * Prisma-based implementation of CredentialStorage for the MCP package
 */
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
      isDynamic: true, // All stored credentials are from dynamic registration
    };
  }

  async storeClientCredentials(
    integration: string,
    credentials: ClientCredentials,
  ): Promise<void> {
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
    emailAccountId: string,
  ): Promise<ConnectionCredentials | null> {
    const connection = await prisma.mcpConnection.findFirst({
      where: {
        emailAccountId,
        integration: {
          name: integration,
        },
        isActive: true,
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
    emailAccountId: string,
    credentials: ConnectionCredentials,
  ): Promise<void> {
    const mcpIntegration = await prisma.mcpIntegration.findUnique({
      where: { name: integration },
    });

    if (!mcpIntegration) {
      throw new Error(`Integration not found: ${integration}`);
    }

    await prisma.mcpConnection.create({
      data: {
        name: integration,
        emailAccountId,
        integrationId: mcpIntegration.id,
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        apiKey: credentials.apiKey,
        expiresAt: credentials.expiresAt,
        isActive: true,
      },
    });
  }

  async updateConnectionCredentials(
    integration: string,
    emailAccountId: string,
    credentials: Partial<ConnectionCredentials>,
  ): Promise<void> {
    // Find the connection
    const connection = await prisma.mcpConnection.findFirst({
      where: {
        emailAccountId,
        integration: {
          name: integration,
        },
        isActive: true,
      },
    });

    if (!connection) {
      throw new Error(
        `Connection not found for integration ${integration} and user ${emailAccountId}`,
      );
    }

    await prisma.mcpConnection.update({
      where: { id: connection.id },
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

/**
 * Create a singleton instance of the storage adapter
 */
export const credentialStorage = new PrismaCredentialStorage();
