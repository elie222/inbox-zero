/**
 * Plugin Storage interface for persisting data.
 *
 * All storage is scoped to the plugin - plugins cannot access data stored by other plugins.
 * Storage is organized into three scopes:
 * - Key-value storage: General purpose storage with optional TTL
 * - User settings: Per-user configuration (shared across all email accounts)
 * - Account settings: Per-email-account configuration
 *
 * @example
 * ```typescript
 * // General key-value storage
 * await ctx.storage.set('last-sync', new Date().toISOString());
 * const lastSync = await ctx.storage.get<string>('last-sync');
 *
 * // With TTL (cache for 1 hour)
 * await ctx.storage.set('api-response', data, 3600);
 *
 * // User settings (applies to all email accounts for this user)
 * await ctx.storage.setUserSettings({ theme: 'dark', notifications: true });
 * const userPrefs = await ctx.storage.getUserSettings<UserPrefs>();
 *
 * // Account settings (specific to one email account)
 * await ctx.storage.setAccountSettings({ syncEnabled: true, folder: 'INBOX' });
 * const accountPrefs = await ctx.storage.getAccountSettings<AccountPrefs>();
 * ```
 */
export interface PluginStorage {
  /**
   * Get a value from key-value storage.
   *
   * @param key - The storage key
   * @returns The stored value, or null if not found or expired
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in key-value storage.
   *
   * @param key - The storage key
   * @param value - The value to store (must be JSON-serializable)
   * @param ttl - Optional time-to-live in seconds. If not provided, the value persists indefinitely.
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Delete a value from key-value storage.
   *
   * @param key - The storage key to delete
   */
  delete(key: string): Promise<void>;

  /**
   * Get user-level settings for the current user.
   *
   * User settings are shared across all email accounts belonging to the user.
   * Useful for storing user preferences and global plugin configuration.
   *
   * @returns The user settings, or null if not set
   */
  getUserSettings<T>(): Promise<T | null>;

  /**
   * Set user-level settings for the current user.
   *
   * User settings are shared across all email accounts belonging to the user.
   * The provided settings object completely replaces any existing settings.
   *
   * @param settings - The settings object to store (must be JSON-serializable)
   */
  setUserSettings<T>(settings: T): Promise<void>;

  /**
   * Get account-level settings for the current email account.
   *
   * Account settings are specific to a single email account.
   * Useful for storing account-specific configuration like sync preferences.
   *
   * @returns The account settings, or null if not set
   */
  getAccountSettings<T>(): Promise<T | null>;

  /**
   * Set account-level settings for the current email account.
   *
   * Account settings are specific to a single email account.
   * The provided settings object completely replaces any existing settings.
   *
   * @param settings - The settings object to store (must be JSON-serializable)
   */
  setAccountSettings<T>(settings: T): Promise<void>;
}
