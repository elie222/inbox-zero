import prisma from "@/utils/prisma";
import type { PluginStorage } from "@/lib/plugin-runtime/types";
import { createScopedLogger } from "@/utils/logger";
import type { Prisma } from "@/generated/prisma/client";

const logger = createScopedLogger("plugin-runtime/storage");

/**
 * Key prefix for distinguishing key-value storage from settings
 * in the PluginAccountSettings.settings JSON field.
 */
const KV_PREFIX = "_kv:";

/**
 * Metadata key for storing TTL information
 */
const TTL_METADATA_KEY = "_ttl_metadata";

/**
 * Maximum size for settings JSON in bytes.
 * 64KB should be plenty for user preferences, prevents abuse.
 */
const SETTINGS_MAX_SIZE_BYTES = 64 * 1024; // 64KB

/**
 * Maximum size for individual key-value entries in bytes.
 */
const KV_MAX_VALUE_SIZE_BYTES = 16 * 1024; // 16KB

/**
 * Maximum total size for all key-value entries combined in bytes.
 * Prevents abuse by creating many small keys.
 */
const KV_TOTAL_MAX_SIZE_BYTES = 256 * 1024; // 256KB

interface TtlMetadata {
  [key: string]: number; // key -> expiration timestamp in ms
}

/**
 * Implementation of the PluginStorage interface.
 * Provides scoped storage for plugins with support for:
 * - Key-value storage with optional TTL (stored in PluginAccountSettings)
 * - Per-user settings (stored in PluginUserSettings)
 * - Per-email-account settings (stored in PluginAccountSettings)
 */
class PluginStorageImpl implements PluginStorage {
  readonly #pluginId: string;
  readonly #userId: string;
  readonly #emailAccountId: string;

  constructor(pluginId: string, userId: string, emailAccountId: string) {
    this.#pluginId = pluginId;
    this.#userId = userId;
    this.#emailAccountId = emailAccountId;
  }

  /**
   * Get a value from key-value storage.
   * Returns null if the key doesn't exist or has expired.
   */
  async get<T>(key: string): Promise<T | null> {
    const kvKey = `${KV_PREFIX}${key}`;

    try {
      const record = await prisma.pluginAccountSettings.findUnique({
        where: {
          pluginId_emailAccountId: {
            pluginId: this.#pluginId,
            emailAccountId: this.#emailAccountId,
          },
        },
        select: { settings: true },
      });

      if (!record?.settings) {
        return null;
      }

      const settings = record.settings as Record<string, unknown>;

      // check TTL
      const ttlMetadata = settings[TTL_METADATA_KEY] as TtlMetadata | undefined;
      if (ttlMetadata?.[key]) {
        if (Date.now() > ttlMetadata[key]) {
          // expired - clean up asynchronously
          this.delete(key).catch((error) => {
            logger.error("Failed to delete expired key", {
              pluginId: this.#pluginId,
              key,
              error,
            });
          });
          return null;
        }
      }

      const value = settings[kvKey];
      return value !== undefined ? (value as T) : null;
    } catch (error) {
      logger.error("Failed to get storage value", {
        pluginId: this.#pluginId,
        key,
        error,
      });
      throw new PluginStorageError(
        `Failed to get storage value for key "${key}"`,
        error,
      );
    }
  }

  /**
   * Set a value in key-value storage.
   * Optionally specify a TTL in seconds.
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const kvKey = `${KV_PREFIX}${key}`;

    // enforce size limit to prevent abuse
    const serialized = JSON.stringify(value);
    if (serialized.length > KV_MAX_VALUE_SIZE_BYTES) {
      throw new Error(
        `Value exceeds maximum size of ${KV_MAX_VALUE_SIZE_BYTES} bytes (got ${serialized.length})`,
      );
    }

    try {
      // first, get current settings to merge
      const existing = await prisma.pluginAccountSettings.findUnique({
        where: {
          pluginId_emailAccountId: {
            pluginId: this.#pluginId,
            emailAccountId: this.#emailAccountId,
          },
        },
        select: { settings: true },
      });

      const currentSettings =
        (existing?.settings as Record<string, unknown>) ?? {};

      // update TTL metadata if ttl is provided
      let ttlMetadata =
        (currentSettings[TTL_METADATA_KEY] as TtlMetadata) ?? {};
      if (ttl !== undefined && ttl > 0) {
        ttlMetadata = {
          ...ttlMetadata,
          [key]: Date.now() + ttl * 1000,
        };
      } else {
        // remove TTL if not specified
        const { [key]: _, ...rest } = ttlMetadata;
        ttlMetadata = rest;
      }

      const updatedSettings: Record<string, unknown> = {
        ...currentSettings,
        [kvKey]: value,
        [TTL_METADATA_KEY]: ttlMetadata,
      };

      // check total KV storage size to prevent abuse via many small keys
      const kvEntries = Object.entries(updatedSettings).filter(([k]) =>
        k.startsWith(KV_PREFIX),
      );
      const totalKvSize = kvEntries.reduce(
        (sum, [k, v]) => sum + k.length + JSON.stringify(v).length,
        0,
      );
      if (totalKvSize > KV_TOTAL_MAX_SIZE_BYTES) {
        throw new Error(
          `Total key-value storage exceeds maximum of ${KV_TOTAL_MAX_SIZE_BYTES} bytes (got ${totalKvSize})`,
        );
      }

      await prisma.pluginAccountSettings.upsert({
        where: {
          pluginId_emailAccountId: {
            pluginId: this.#pluginId,
            emailAccountId: this.#emailAccountId,
          },
        },
        create: {
          pluginId: this.#pluginId,
          emailAccountId: this.#emailAccountId,
          settings: updatedSettings as Prisma.InputJsonValue,
        },
        update: {
          settings: updatedSettings as Prisma.InputJsonValue,
        },
      });

      logger.trace("Set storage value", {
        pluginId: this.#pluginId,
        key,
        hasTtl: ttl !== undefined,
      });
    } catch (error) {
      logger.error("Failed to set storage value", {
        pluginId: this.#pluginId,
        key,
        error,
      });
      throw new PluginStorageError(
        `Failed to set storage value for key "${key}"`,
        error,
      );
    }
  }

  /**
   * Delete a key from key-value storage.
   */
  async delete(key: string): Promise<void> {
    const kvKey = `${KV_PREFIX}${key}`;

    try {
      const existing = await prisma.pluginAccountSettings.findUnique({
        where: {
          pluginId_emailAccountId: {
            pluginId: this.#pluginId,
            emailAccountId: this.#emailAccountId,
          },
        },
        select: { settings: true },
      });

      if (!existing?.settings) {
        return; // nothing to delete
      }

      const currentSettings = existing.settings as Record<string, unknown>;
      const { [kvKey]: _, ...remainingSettings } = currentSettings;

      // also remove from TTL metadata
      const ttlMetadata =
        (remainingSettings[TTL_METADATA_KEY] as TtlMetadata) ?? {};
      const { [key]: __, ...remainingTtl } = ttlMetadata;
      remainingSettings[TTL_METADATA_KEY] = remainingTtl;

      await prisma.pluginAccountSettings.update({
        where: {
          pluginId_emailAccountId: {
            pluginId: this.#pluginId,
            emailAccountId: this.#emailAccountId,
          },
        },
        data: {
          settings: remainingSettings as Prisma.InputJsonValue,
        },
      });

      logger.trace("Deleted storage value", { pluginId: this.#pluginId, key });
    } catch (error) {
      logger.error("Failed to delete storage value", {
        pluginId: this.#pluginId,
        key,
        error,
      });
      throw new PluginStorageError(
        `Failed to delete storage value for key "${key}"`,
        error,
      );
    }
  }

  /**
   * List all keys in key-value storage, optionally filtered by prefix.
   * Expired keys are excluded from the results.
   */
  async list(prefix?: string): Promise<string[]> {
    try {
      const record = await prisma.pluginAccountSettings.findUnique({
        where: {
          pluginId_emailAccountId: {
            pluginId: this.#pluginId,
            emailAccountId: this.#emailAccountId,
          },
        },
        select: { settings: true },
      });

      if (!record?.settings) {
        return [];
      }

      const settings = record.settings as Record<string, unknown>;
      const ttlMetadata = settings[TTL_METADATA_KEY] as TtlMetadata | undefined;
      const now = Date.now();

      // get all KV keys, filter out expired ones, and strip the prefix
      const keys = Object.keys(settings)
        .filter((k) => k.startsWith(KV_PREFIX))
        .map((k) => k.slice(KV_PREFIX.length))
        .filter((key) => {
          // filter out expired keys
          if (ttlMetadata?.[key] && now > ttlMetadata[key]) {
            return false;
          }
          // filter by user-provided prefix if specified
          if (prefix && !key.startsWith(prefix)) {
            return false;
          }
          return true;
        });

      logger.trace("Listed storage keys", {
        pluginId: this.#pluginId,
        prefix,
        count: keys.length,
      });

      return keys;
    } catch (error) {
      logger.error("Failed to list storage keys", {
        pluginId: this.#pluginId,
        prefix,
        error,
      });
      throw new PluginStorageError("Failed to list storage keys", error);
    }
  }

  /**
   * Get per-user settings for the plugin.
   * These settings are shared across all email accounts for the same user.
   */
  async getUserSettings<T>(): Promise<T | null> {
    try {
      const record = await prisma.pluginUserSettings.findUnique({
        where: {
          pluginId_userId: {
            pluginId: this.#pluginId,
            userId: this.#userId,
          },
        },
        select: { settings: true },
      });

      if (!record?.settings) {
        return null;
      }

      // filter out any internal keys (prefixed with _)
      const settings = record.settings as Record<string, unknown>;
      const filteredSettings = Object.fromEntries(
        Object.entries(settings).filter(([k]) => !k.startsWith("_")),
      );

      return Object.keys(filteredSettings).length > 0
        ? (filteredSettings as T)
        : null;
    } catch (error) {
      logger.error("Failed to get user settings", {
        pluginId: this.#pluginId,
        userId: this.#userId,
        error,
      });
      throw new PluginStorageError("Failed to get user settings", error);
    }
  }

  /**
   * Set per-user settings for the plugin.
   * These settings are shared across all email accounts for the same user.
   */
  async setUserSettings<T>(settings: T): Promise<void> {
    // enforce size limit to prevent abuse
    const serialized = JSON.stringify(settings);
    if (serialized.length > SETTINGS_MAX_SIZE_BYTES) {
      throw new Error(
        `Settings exceed maximum size of ${SETTINGS_MAX_SIZE_BYTES} bytes (got ${serialized.length})`,
      );
    }

    try {
      // get existing to preserve internal keys
      const existing = await prisma.pluginUserSettings.findUnique({
        where: {
          pluginId_userId: {
            pluginId: this.#pluginId,
            userId: this.#userId,
          },
        },
        select: { settings: true },
      });

      const currentSettings =
        (existing?.settings as Record<string, unknown>) ?? {};

      // preserve internal keys (prefixed with _)
      const internalKeys = Object.fromEntries(
        Object.entries(currentSettings).filter(([k]) => k.startsWith("_")),
      );

      const updatedSettings = {
        ...internalKeys,
        ...(settings as Record<string, unknown>),
      };

      await prisma.pluginUserSettings.upsert({
        where: {
          pluginId_userId: {
            pluginId: this.#pluginId,
            userId: this.#userId,
          },
        },
        create: {
          pluginId: this.#pluginId,
          userId: this.#userId,
          settings: updatedSettings as Prisma.InputJsonValue,
        },
        update: {
          settings: updatedSettings as Prisma.InputJsonValue,
        },
      });

      logger.trace("Set user settings", {
        pluginId: this.#pluginId,
        userId: this.#userId,
      });
    } catch (error) {
      logger.error("Failed to set user settings", {
        pluginId: this.#pluginId,
        userId: this.#userId,
        error,
      });
      throw new PluginStorageError("Failed to set user settings", error);
    }
  }

  /**
   * Get per-email-account settings for the plugin.
   * These settings are specific to a single email account.
   */
  async getAccountSettings<T>(): Promise<T | null> {
    try {
      const record = await prisma.pluginAccountSettings.findUnique({
        where: {
          pluginId_emailAccountId: {
            pluginId: this.#pluginId,
            emailAccountId: this.#emailAccountId,
          },
        },
        select: { settings: true },
      });

      if (!record?.settings) {
        return null;
      }

      // filter out KV storage keys and internal keys
      const settings = record.settings as Record<string, unknown>;
      const filteredSettings = Object.fromEntries(
        Object.entries(settings).filter(
          ([k]) => !k.startsWith(KV_PREFIX) && !k.startsWith("_"),
        ),
      );

      return Object.keys(filteredSettings).length > 0
        ? (filteredSettings as T)
        : null;
    } catch (error) {
      logger.error("Failed to get account settings", {
        pluginId: this.#pluginId,
        emailAccountId: this.#emailAccountId,
        error,
      });
      throw new PluginStorageError("Failed to get account settings", error);
    }
  }

  /**
   * Set per-email-account settings for the plugin.
   * These settings are specific to a single email account.
   */
  async setAccountSettings<T>(settings: T): Promise<void> {
    // enforce size limit to prevent abuse
    const serialized = JSON.stringify(settings);
    if (serialized.length > SETTINGS_MAX_SIZE_BYTES) {
      throw new Error(
        `Settings exceed maximum size of ${SETTINGS_MAX_SIZE_BYTES} bytes (got ${serialized.length})`,
      );
    }

    try {
      // get existing to preserve KV storage and internal keys
      const existing = await prisma.pluginAccountSettings.findUnique({
        where: {
          pluginId_emailAccountId: {
            pluginId: this.#pluginId,
            emailAccountId: this.#emailAccountId,
          },
        },
        select: { settings: true },
      });

      const currentSettings =
        (existing?.settings as Record<string, unknown>) ?? {};

      // preserve KV storage keys (prefixed with _kv:) and internal keys (prefixed with _)
      const preservedKeys = Object.fromEntries(
        Object.entries(currentSettings).filter(
          ([k]) => k.startsWith(KV_PREFIX) || k.startsWith("_"),
        ),
      );

      const updatedSettings = {
        ...preservedKeys,
        ...(settings as Record<string, unknown>),
      };

      await prisma.pluginAccountSettings.upsert({
        where: {
          pluginId_emailAccountId: {
            pluginId: this.#pluginId,
            emailAccountId: this.#emailAccountId,
          },
        },
        create: {
          pluginId: this.#pluginId,
          emailAccountId: this.#emailAccountId,
          settings: updatedSettings as Prisma.InputJsonValue,
        },
        update: {
          settings: updatedSettings as Prisma.InputJsonValue,
        },
      });

      logger.trace("Set account settings", {
        pluginId: this.#pluginId,
        emailAccountId: this.#emailAccountId,
      });
    } catch (error) {
      logger.error("Failed to set account settings", {
        pluginId: this.#pluginId,
        emailAccountId: this.#emailAccountId,
        error,
      });
      throw new PluginStorageError("Failed to set account settings", error);
    }
  }
}

/**
 * Custom error class for plugin storage operations.
 */
class PluginStorageError extends Error {
  readonly code = "plugin-storage-error";
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "PluginStorageError";
    this.cause = cause;
  }
}

/**
 * Creates a scoped storage instance for a plugin.
 * The storage is scoped to the specific plugin, user, and email account.
 *
 * @param pluginId - Unique identifier for the plugin (from plugin manifest)
 * @param userId - The user ID for user-level settings
 * @param emailAccountId - The email account ID for account-level settings and KV storage
 * @returns A PluginStorage instance
 */
export function createPluginStorage(
  pluginId: string,
  userId: string,
  emailAccountId: string,
): PluginStorage {
  return new PluginStorageImpl(pluginId, userId, emailAccountId);
}

export { PluginStorageError };
