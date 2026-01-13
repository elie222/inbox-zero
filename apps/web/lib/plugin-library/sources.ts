/**
 * Plugin Sources - Token management for private plugin repositories
 *
 * Handles lookup and storage of GitHub tokens for private plugin sources.
 * Supports both global (admin-managed) and user-scoped sources.
 */

import prisma from "@/utils/prisma";
import { decryptToken, encryptToken } from "@/utils/encryption";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("plugin-sources");

export type PluginSourceType = "catalog" | "plugin";
export type PluginSourceScope = "global" | "user";

export interface PluginSourceInput {
  url: string;
  token?: string; // Plain text token (will be encrypted)
  type: PluginSourceType;
  scope: PluginSourceScope;
  name?: string;
  userId?: string; // Required for user-scoped sources
}

/**
 * Get the decrypted GitHub token for a URL.
 * Checks user-specific source first, then falls back to global.
 */
export async function getTokenForUrl(
  url: string,
  userId?: string,
): Promise<string | undefined> {
  try {
    // normalize URL for lookup
    const normalizedUrl = normalizeGitHubUrl(url);

    // check user-specific source first
    if (userId) {
      const userSource = await prisma.pluginSource.findFirst({
        where: {
          url: normalizedUrl,
          userId,
          enabled: true,
        },
      });

      if (userSource?.encryptedToken) {
        const token = decryptToken(userSource.encryptedToken);
        if (token) return token;
      }
    }

    // fall back to global source
    const globalSource = await prisma.pluginSource.findFirst({
      where: {
        url: normalizedUrl,
        scope: "global",
        userId: null,
        enabled: true,
      },
    });

    if (globalSource?.encryptedToken) {
      const token = decryptToken(globalSource.encryptedToken);
      if (token) return token;
    }

    return undefined;
  } catch (error) {
    logger.error("Failed to get token for URL", { url, error });
    return undefined;
  }
}

/**
 * Create or update a plugin source.
 */
export async function upsertPluginSource(
  input: PluginSourceInput,
): Promise<{ id: string } | null> {
  try {
    const normalizedUrl = normalizeGitHubUrl(input.url);
    const encryptedToken = input.token ? encryptToken(input.token) : null;

    // for user-scoped, use url+userId as unique key
    // for global, use url+null userId
    const userId = input.scope === "user" ? input.userId : null;

    if (input.scope === "user" && !userId) {
      logger.error("User ID required for user-scoped source");
      return null;
    }

    const source = await prisma.pluginSource.upsert({
      where: {
        url_userId: {
          url: normalizedUrl,
          userId: userId ?? "",
        },
      },
      create: {
        url: normalizedUrl,
        encryptedToken,
        type: input.type,
        scope: input.scope,
        name: input.name,
        userId,
        enabled: true,
      },
      update: {
        encryptedToken,
        type: input.type,
        name: input.name,
        enabled: true,
      },
    });

    return { id: source.id };
  } catch (error) {
    logger.error("Failed to upsert plugin source", { error });
    return null;
  }
}

/**
 * Delete a plugin source.
 */
export async function deletePluginSource(
  id: string,
  userId?: string,
): Promise<boolean> {
  try {
    // if userId provided, ensure user owns the source
    const whereClause: { id: string; userId?: string } = { id };
    if (userId) {
      whereClause.userId = userId;
    }

    await prisma.pluginSource.delete({
      where: whereClause,
    });

    return true;
  } catch (error) {
    logger.error("Failed to delete plugin source", { id, error });
    return false;
  }
}

/**
 * List plugin sources for a user.
 * Includes both user-specific and global sources.
 */
export async function listPluginSources(userId?: string): Promise<
  Array<{
    id: string;
    url: string;
    type: string;
    scope: string;
    name: string | null;
    hasToken: boolean;
    enabled: boolean;
  }>
> {
  try {
    const sources = await prisma.pluginSource.findMany({
      where: {
        OR: [{ userId }, { scope: "global", userId: null }],
      },
      orderBy: [{ scope: "asc" }, { createdAt: "desc" }],
    });

    return sources.map((source) => ({
      id: source.id,
      url: source.url,
      type: source.type,
      scope: source.scope,
      name: source.name,
      hasToken: !!source.encryptedToken,
      enabled: source.enabled,
    }));
  } catch (error) {
    logger.error("Failed to list plugin sources", { error });
    return [];
  }
}

/**
 * Toggle enabled status for a plugin source.
 */
export async function togglePluginSource(
  id: string,
  enabled: boolean,
  userId?: string,
): Promise<boolean> {
  try {
    const whereClause: { id: string; userId?: string } = { id };
    if (userId) {
      whereClause.userId = userId;
    }

    await prisma.pluginSource.update({
      where: whereClause,
      data: { enabled },
    });

    return true;
  } catch (error) {
    logger.error("Failed to toggle plugin source", { id, error });
    return false;
  }
}

/**
 * Normalize GitHub URL for consistent lookup.
 */
function normalizeGitHubUrl(url: string): string {
  let normalized = url.trim();

  // ensure https
  if (!normalized.startsWith("https://") && !normalized.startsWith("http://")) {
    normalized = `https://${normalized}`;
  }
  normalized = normalized.replace("http://", "https://");

  // remove trailing slash
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  // remove .git suffix
  if (normalized.endsWith(".git")) {
    normalized = normalized.slice(0, -4);
  }

  return normalized;
}
