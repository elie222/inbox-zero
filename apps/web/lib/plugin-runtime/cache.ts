/**
 * Plugin Runtime Cache
 *
 * TTL-based cache for plugin runtime to reduce database queries.
 * Includes automatic eviction to prevent unbounded memory growth.
 */

import { env } from "@/env";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface CacheOptions {
  /** default TTL in milliseconds */
  defaultTtlMs?: number;
  /** max entries before eviction triggers */
  maxEntries?: number;
  /** entries to evict when max is reached */
  evictionCount?: number;
}

// -----------------------------------------------------------------------------
// TTL Cache Class
// -----------------------------------------------------------------------------

export class TtlCache<T = unknown> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;
  private readonly evictionCount: number;

  constructor(options: CacheOptions = {}) {
    // shorter TTL in dev for faster iteration
    const isDev = env.NODE_ENV === "development";
    this.defaultTtlMs = options.defaultTtlMs ?? (isDev ? 30_000 : 300_000); // 30s dev, 5min prod
    this.maxEntries = options.maxEntries ?? 1000;
    this.evictionCount = options.evictionCount ?? 100;
  }

  /**
   * Get a value from cache if it exists and hasn't expired.
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set a value in cache with optional custom TTL.
   */
  set(key: string, data: T, ttlMs?: number): void {
    // prevent unbounded growth
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs ?? this.defaultTtlMs,
    });
  }

  /**
   * Check if a key exists and hasn't expired.
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete a specific key from cache.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all keys matching a prefix.
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Evict oldest entries to make room for new ones.
   */
  private evictOldest(): void {
    const entries = [...this.cache.entries()].sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );

    const toEvict = entries.slice(0, this.evictionCount);
    for (const [key] of toEvict) {
      this.cache.delete(key);
    }
  }

  /**
   * Remove all expired entries (manual cleanup).
   */
  cleanup(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }
}

// -----------------------------------------------------------------------------
// Singleton Caches
// -----------------------------------------------------------------------------

/**
 * Cache for plugin enabled status per user.
 * Key format: "enabled:{pluginId}:{userId}"
 */
export const pluginEnabledCache = new TtlCache<boolean>({
  defaultTtlMs: process.env.NODE_ENV === "development" ? 30_000 : 300_000,
  maxEntries: 10_000, // support many user/plugin combinations
});

/**
 * Invalidate all cached enabled status for a plugin.
 * Call this when plugin settings change.
 */
export function invalidatePluginCache(pluginId: string): void {
  pluginEnabledCache.deleteByPrefix(`enabled:${pluginId}:`);
}

/**
 * Invalidate all cached enabled status for a user.
 * Call this when user settings change.
 */
export function invalidateUserPluginCache(_userId: string): void {
  // can't efficiently iterate by user since it's the second part of key
  // for full user invalidation, clear entire cache
  pluginEnabledCache.clear();
}

/**
 * Get cache key for plugin enabled status.
 */
export function getPluginEnabledCacheKey(
  pluginId: string,
  userId: string,
): string {
  return `enabled:${pluginId}:${userId}`;
}
