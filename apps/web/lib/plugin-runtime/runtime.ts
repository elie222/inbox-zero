/**
 * Plugin Runtime
 *
 * Main runtime for loading, managing, and executing Inbox Zero plugins.
 * Handles plugin discovery, capability routing, trust enforcement, and hook execution.
 */

import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type {
  PluginManifest,
  PluginCapability,
} from "@/packages/plugin-sdk/src/schemas/plugin-manifest";
import type {
  InboxZeroPlugin,
  Classification,
  Draft,
  EmailSignal,
  RuleResult,
  FollowupResult,
  CalendarEvent,
} from "./types";
import type { PluginMcpTool } from "@/packages/plugin-sdk/src/types/mcp";
import type {
  CapabilityHandler,
  CapabilityResult,
} from "@/packages/plugin-sdk/src/types/capability";
import {
  createEmailContext,
  createDraftContext,
  createRuleContext,
  createCalendarContext,
  createTriggeredEmailContext,
  createScheduledTriggerContext,
  createInitContext,
  createCapabilityContext,
  type Email,
  type EmailAccount,
} from "./context-factory";
import {
  getTrustLevel,
  getEffectiveCapabilities,
  type TrustLevel,
} from "./trust";
import { loadPlugins, loadPluginById } from "./loader";
import {
  pluginEnabledCache,
  getPluginEnabledCacheKey,
  invalidatePluginCache,
} from "./cache";

const logger = createScopedLogger("plugin-runtime");

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Default timeout for plugin hook execution (30 seconds) */
const DEFAULT_HOOK_TIMEOUT_MS = 30_000;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RuntimeLoadedPlugin {
  manifest: PluginManifest;
  plugin: InboxZeroPlugin;
  trustLevel: TrustLevel;
  effectiveCapabilities: PluginCapability[];
}

export interface PluginExecutionResult<T> {
  pluginId: string;
  result: T | null;
  executionTimeMs: number;
  error?: string;
}

export interface DraftContextOptions {
  thread?: Email[];
  preferences?: {
    tone?: string;
    signature?: string;
    language?: string;
  };
}

export interface TriggeredEmailContextOptions {
  triggerId: string;
  triggerType: "plus-tag" | "from-pattern" | "subject-pattern" | "custom";
  matchedValue: string;
}

export interface ScheduledTriggerContextOptions {
  scheduleId: string;
  scheduleName: string;
  scheduledAt: Date;
  data?: Record<string, unknown>;
}

export interface RuleContextOptions {
  ruleId: string;
  ruleName: string;
  ruleData?: Record<string, unknown>;
}

export interface PluginRuntimeOptions {
  /** Timeout in milliseconds for hook execution */
  hookTimeoutMs?: number;
}

/**
 * Collected chat context from a plugin.
 */
export interface CollectedChatContext {
  pluginId: string;
  pluginName: string;
  instructions?: string;
  knowledge?: string[];
  tone?: string;
}

/**
 * Registered capability with its associated plugin.
 */
interface RegisteredCapability {
  pluginId: string;
  handler: CapabilityHandler;
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Execute a function with a timeout.
 * Rejects with an error if the function does not complete within the timeout.
 */
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  pluginId: string,
  hookName: string,
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `Plugin ${pluginId} hook ${hookName} timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);
  });

  return Promise.race([fn(), timeoutPromise]);
}

// -----------------------------------------------------------------------------
// Plugin Runtime Class
// -----------------------------------------------------------------------------

export class PluginRuntime {
  private readonly plugins: Map<string, RuntimeLoadedPlugin> = new Map();
  private readonly routingTable: Map<PluginCapability, string[]> = new Map();
  private readonly capabilities: Map<string, RegisteredCapability> = new Map();
  private initialized = false;
  private initializing = false;
  private readonly hookTimeoutMs: number;

  constructor(options?: PluginRuntimeOptions) {
    this.hookTimeoutMs = options?.hookTimeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS;
  }

  /**
   * Ensure the runtime is initialized before executing hooks.
   * In dev mode, this enables lazy initialization on first use.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) {
      // wait for ongoing initialization
      while (this.initializing) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return;
    }
    await this.initialize();
  }

  /**
   * Initialize the plugin runtime - load all plugins and build routing table.
   * Should be called once during application startup.
   */
  async initialize(): Promise<void> {
    // check feature flag
    if (!env.FEATURE_PLUGINS_ENABLED) {
      logger.info("Plugin system disabled via FEATURE_PLUGINS_ENABLED");
      return;
    }

    if (this.initialized) {
      logger.warn("Plugin runtime already initialized");
      return;
    }

    if (this.initializing) {
      logger.warn("Plugin runtime initialization already in progress");
      return;
    }

    this.initializing = true;
    logger.info("Initializing plugin runtime");

    try {
      // load installed plugins from database
      const installedPlugins = await prisma.installedPlugin.findMany({
        where: { enabled: true },
      });

      logger.info("Found installed plugins in database", {
        count: installedPlugins.length,
      });

      // load plugins from filesystem
      const { plugins: loadedPlugins, errors } = await loadPlugins();

      if (errors.length > 0) {
        logger.warn("Some plugins failed to load", {
          errorCount: errors.length,
        });
      }

      // register plugins that are both installed and loaded
      for (const installed of installedPlugins) {
        const loaded = loadedPlugins.find((p) => p.id === installed.pluginId);
        if (loaded) {
          this.registerPlugin(loaded.manifest, loaded.module);
        } else {
          logger.warn("Installed plugin not found on filesystem", {
            pluginId: installed.pluginId,
          });
        }
      }

      this.initialized = true;
      logger.info("Plugin runtime initialized", {
        loadedPlugins: this.plugins.size,
        capabilities: Array.from(this.routingTable.entries()).map(
          ([cap, ids]) => ({
            capability: cap,
            plugins: ids,
          }),
        ),
      });
    } catch (error) {
      logger.error("Failed to initialize plugin runtime", { error });
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Check if a plugin is enabled for a specific user.
   * Checks both InstalledPlugin.enabled AND PluginUserSettings.enabled.
   * Results are cached with TTL to reduce database queries.
   */
  private async isPluginEnabledForUser(
    pluginId: string,
    userId: string,
  ): Promise<boolean> {
    const cacheKey = getPluginEnabledCacheKey(pluginId, userId);

    // check cache first
    const cached = pluginEnabledCache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const installed = await prisma.installedPlugin.findUnique({
        where: { pluginId },
        include: {
          userSettings: {
            where: { userId },
          },
        },
      });

      let enabled = false;

      if (installed?.enabled) {
        // check user-specific settings if they exist
        const userSettings = installed.userSettings[0];
        enabled = !userSettings || userSettings.enabled;
      }

      // cache the result
      pluginEnabledCache.set(cacheKey, enabled);

      return enabled;
    } catch (error) {
      logger.error("Error checking plugin enabled status", {
        pluginId,
        userId,
        error,
      });
      return false;
    }
  }

  /**
   * Invalidate cached enabled status for a plugin.
   * Call this when plugin settings change.
   */
  invalidatePluginCache(pluginId: string): void {
    invalidatePluginCache(pluginId);
  }

  /**
   * Register a loaded plugin with the runtime.
   * Enforces trust-based capability gating.
   */
  registerPlugin(manifest: PluginManifest, plugin: InboxZeroPlugin): void {
    const trustLevel = getTrustLevel(manifest.id);

    // filter capabilities based on trust level
    const effectiveCapabilities = getEffectiveCapabilities(
      manifest.id,
      manifest.capabilities,
    ) as PluginCapability[];

    if (effectiveCapabilities.length < manifest.capabilities.length) {
      const blockedCapabilities = manifest.capabilities.filter(
        (cap) => !effectiveCapabilities.includes(cap),
      );
      logger.warn("Some capabilities blocked due to trust level", {
        pluginId: manifest.id,
        trustLevel,
        blockedCapabilities,
      });
    }

    // store the plugin
    this.plugins.set(manifest.id, {
      manifest,
      plugin,
      trustLevel,
      effectiveCapabilities,
    });

    // build routing table for allowed capabilities
    for (const capability of effectiveCapabilities) {
      const existing = this.routingTable.get(capability) ?? [];
      existing.push(manifest.id);
      this.routingTable.set(capability, existing);
    }

    // register capability handlers from the plugin if present
    if (plugin.capability) {
      this.registerCapability(plugin.capability, manifest.id);
    }

    logger.info("Plugin registered", {
      pluginId: manifest.id,
      capabilities: effectiveCapabilities,
      trustLevel,
    });
  }

  /**
   * Register a capability handler.
   *
   * Capabilities are identified by their unique ID and associated with a plugin.
   * Only one handler can be registered per capability ID.
   *
   * @param handler - The capability handler to register
   * @param pluginId - The plugin ID that provides this capability (optional if called externally)
   */
  registerCapability(handler: CapabilityHandler, pluginId?: string): void {
    const resolvedPluginId = pluginId ?? handler.id;

    if (this.capabilities.has(handler.id)) {
      logger.warn("Capability already registered, overwriting", {
        capabilityId: handler.id,
        existingPluginId: this.capabilities.get(handler.id)?.pluginId,
        newPluginId: resolvedPluginId,
      });
    }

    this.capabilities.set(handler.id, {
      pluginId: resolvedPluginId,
      handler,
    });

    logger.info("Capability registered", {
      capabilityId: handler.id,
      pluginId: resolvedPluginId,
      routingHints: handler.routingHints,
    });
  }

  /**
   * Unregister a plugin from the runtime.
   */
  unregisterPlugin(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return false;
    }

    // remove from routing table
    for (const [, pluginIds] of this.routingTable.entries()) {
      const index = pluginIds.indexOf(pluginId);
      if (index !== -1) {
        pluginIds.splice(index, 1);
      }
    }

    // remove any capabilities registered by this plugin
    for (const [capabilityId, registered] of this.capabilities.entries()) {
      if (registered.pluginId === pluginId) {
        this.capabilities.delete(capabilityId);
      }
    }

    // remove from plugins map
    this.plugins.delete(pluginId);

    logger.info("Plugin unregistered", { pluginId });
    return true;
  }

  /**
   * Get plugin IDs that have a specific capability.
   */
  private getPluginsWithCapability(capability: PluginCapability): string[] {
    return this.routingTable.get(capability) ?? [];
  }

  /**
   * Execute classifyEmail hook across all plugins with email:classify capability.
   *
   * @deprecated Use capability-based routing via executeCapability() instead.
   * This method will be removed in a future version.
   */
  async executeClassifyEmail(
    email: Email,
    emailAccount: EmailAccount,
    userId: string,
  ): Promise<PluginExecutionResult<Classification>[]> {
    if (!env.FEATURE_PLUGINS_ENABLED) {
      return [];
    }

    // lazy init in dev mode
    await this.ensureInitialized();

    const capability: PluginCapability = "email:classify";
    const pluginIds = this.getPluginsWithCapability(capability);
    const results: PluginExecutionResult<Classification>[] = [];

    for (const pluginId of pluginIds) {
      const loadedPlugin = this.plugins.get(pluginId);
      if (!loadedPlugin) continue;

      // check if plugin is enabled for user
      const isEnabled = await this.isPluginEnabledForUser(pluginId, userId);
      if (!isEnabled) {
        logger.trace("Plugin disabled for user, skipping", {
          pluginId,
          userId,
        });
        continue;
      }

      const { plugin, manifest } = loadedPlugin;

      if (!plugin.classifyEmail) {
        continue;
      }

      const startTime = Date.now();
      try {
        const context = await createEmailContext({
          email,
          emailAccount,
          manifest,
          userId,
          pluginId,
        });

        const result = await withTimeout(
          () => plugin.classifyEmail!(context),
          this.hookTimeoutMs,
          pluginId,
          "classifyEmail",
        );

        results.push({
          pluginId,
          result,
          executionTimeMs: Date.now() - startTime,
        });
      } catch (error) {
        logger.error("Plugin classifyEmail error", { pluginId, error });
        results.push({
          pluginId,
          result: null,
          executionTimeMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Execute a capability handler by ID.
   *
   * Routes the email to the plugin that provides the specified capability,
   * creates the appropriate context, and executes the handler with timeout.
   *
   * @param capabilityId - The unique identifier of the capability to execute
   * @param email - The email to process
   * @param emailAccount - The email account context
   * @param userId - The user ID for permission checks
   * @param enrichment - Optional additional data to pass to the capability
   * @returns The execution result or null if capability not found/disabled
   */
  async executeCapability(
    capabilityId: string,
    email: Email,
    emailAccount: EmailAccount,
    userId: string,
    enrichment?: Record<string, unknown>,
  ): Promise<PluginExecutionResult<CapabilityResult> | null> {
    if (!env.FEATURE_PLUGINS_ENABLED) {
      return null;
    }

    await this.ensureInitialized();

    // find the registered capability
    const registered = this.capabilities.get(capabilityId);
    if (!registered) {
      logger.warn("Capability not found", { capabilityId });
      return null;
    }

    const { pluginId, handler } = registered;

    // get the loaded plugin
    const loadedPlugin = this.plugins.get(pluginId);
    if (!loadedPlugin) {
      logger.warn("Plugin not loaded for capability", {
        capabilityId,
        pluginId,
      });
      return null;
    }

    // check if plugin is enabled for user
    const isEnabled = await this.isPluginEnabledForUser(pluginId, userId);
    if (!isEnabled) {
      logger.trace("Plugin disabled for user, skipping capability", {
        pluginId,
        userId,
        capabilityId,
      });
      return null;
    }

    const { manifest } = loadedPlugin;

    const startTime = Date.now();
    try {
      // create capability context
      const context = await createCapabilityContext({
        email,
        emailAccount,
        manifest,
        userId,
        pluginId,
        enrichment,
      });

      // execute the capability handler with timeout
      const result = await withTimeout(
        () => handler.execute(context),
        this.hookTimeoutMs,
        pluginId,
        `capability:${capabilityId}`,
      );

      logger.info("Capability executed", {
        capabilityId,
        pluginId,
        handled: result.handled,
        executionTimeMs: Date.now() - startTime,
      });

      return {
        pluginId,
        result,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error("Capability execution error", {
        capabilityId,
        pluginId,
        error,
      });
      return {
        pluginId,
        result: null,
        executionTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute draftReply hook across all plugins with email:draft capability.
   */
  async executeDraftReply(
    email: Email,
    emailAccount: EmailAccount,
    userId: string,
    ctx?: DraftContextOptions,
  ): Promise<PluginExecutionResult<Draft>[]> {
    if (!env.FEATURE_PLUGINS_ENABLED) {
      return [];
    }

    await this.ensureInitialized();

    const capability: PluginCapability = "email:draft";
    const pluginIds = this.getPluginsWithCapability(capability);
    const results: PluginExecutionResult<Draft>[] = [];

    for (const pluginId of pluginIds) {
      const loadedPlugin = this.plugins.get(pluginId);
      if (!loadedPlugin) continue;

      const isEnabled = await this.isPluginEnabledForUser(pluginId, userId);
      if (!isEnabled) continue;

      const { plugin, manifest } = loadedPlugin;

      if (!plugin.draftReply) {
        continue;
      }

      const startTime = Date.now();
      try {
        const context = await createDraftContext({
          email,
          emailAccount,
          manifest,
          userId,
          pluginId,
          thread: ctx?.thread,
          preferences: ctx?.preferences,
        });

        const result = await withTimeout(
          () => plugin.draftReply!(context),
          this.hookTimeoutMs,
          pluginId,
          "draftReply",
        );

        results.push({
          pluginId,
          result,
          executionTimeMs: Date.now() - startTime,
        });
      } catch (error) {
        logger.error("Plugin draftReply error", { pluginId, error });
        results.push({
          pluginId,
          result: null,
          executionTimeMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Execute onEmailReceived hook across all plugins with email:signal capability.
   */
  async executeOnEmailReceived(
    email: Email,
    emailAccount: EmailAccount,
    userId: string,
  ): Promise<PluginExecutionResult<EmailSignal[]>[]> {
    if (!env.FEATURE_PLUGINS_ENABLED) {
      return [];
    }

    await this.ensureInitialized();

    const capability: PluginCapability = "email:signal";
    const pluginIds = this.getPluginsWithCapability(capability);
    const results: PluginExecutionResult<EmailSignal[]>[] = [];

    for (const pluginId of pluginIds) {
      const loadedPlugin = this.plugins.get(pluginId);
      if (!loadedPlugin) continue;

      const isEnabled = await this.isPluginEnabledForUser(pluginId, userId);
      if (!isEnabled) continue;

      const { plugin, manifest } = loadedPlugin;

      if (!plugin.onEmailReceived) {
        continue;
      }

      const startTime = Date.now();
      try {
        const context = await createEmailContext({
          email,
          emailAccount,
          manifest,
          userId,
          pluginId,
        });

        const result = await withTimeout(
          () => plugin.onEmailReceived!(context),
          this.hookTimeoutMs,
          pluginId,
          "onEmailReceived",
        );

        results.push({
          pluginId,
          result,
          executionTimeMs: Date.now() - startTime,
        });
      } catch (error) {
        logger.error("Plugin onEmailReceived error", { pluginId, error });
        results.push({
          pluginId,
          result: null,
          executionTimeMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Execute onTriggeredEmail hook for a specific plugin.
   */
  async executeOnTriggeredEmail(
    email: Email,
    emailAccount: EmailAccount,
    userId: string,
    ctx: TriggeredEmailContextOptions,
  ): Promise<PluginExecutionResult<void> | null> {
    if (!env.FEATURE_PLUGINS_ENABLED) {
      return null;
    }

    await this.ensureInitialized();

    // find the plugin that registered the trigger
    // triggers are stored in plugin account settings
    const triggerSettings = await prisma.pluginAccountSettings.findFirst({
      where: {
        emailAccountId: emailAccount.id,
        settings: {
          path: ["triggers"],
          array_contains: [{ id: ctx.triggerId }],
        },
      },
    });

    if (!triggerSettings) {
      logger.warn("No plugin found for trigger", { triggerId: ctx.triggerId });
      return null;
    }

    const pluginId = triggerSettings.pluginId;
    const loadedPlugin = this.plugins.get(pluginId);

    if (!loadedPlugin) {
      logger.warn("Plugin not loaded", { pluginId });
      return null;
    }

    const isEnabled = await this.isPluginEnabledForUser(pluginId, userId);
    if (!isEnabled) {
      return null;
    }

    const { plugin, manifest } = loadedPlugin;

    if (!plugin.onTriggeredEmail) {
      logger.warn("Plugin does not have onTriggeredEmail hook", { pluginId });
      return null;
    }

    const startTime = Date.now();
    try {
      const context = await createTriggeredEmailContext({
        email,
        emailAccount,
        manifest,
        userId,
        pluginId,
        triggerId: ctx.triggerId,
        triggerType: ctx.triggerType,
        matchedValue: ctx.matchedValue,
      });

      await withTimeout(
        () => plugin.onTriggeredEmail!(context),
        this.hookTimeoutMs,
        pluginId,
        "onTriggeredEmail",
      );

      return {
        pluginId,
        result: null,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error("Plugin onTriggeredEmail error", { pluginId, error });
      return {
        pluginId,
        result: null,
        executionTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute onScheduledTrigger hook for a specific plugin.
   */
  async executeOnScheduledTrigger(
    emailAccount: EmailAccount,
    userId: string,
    ctx: ScheduledTriggerContextOptions,
  ): Promise<PluginExecutionResult<void> | null> {
    if (!env.FEATURE_PLUGINS_ENABLED) {
      return null;
    }

    await this.ensureInitialized();

    // find the plugin that registered the schedule
    const scheduleSettings = await prisma.pluginAccountSettings.findFirst({
      where: {
        emailAccountId: emailAccount.id,
        settings: {
          path: ["schedules"],
          array_contains: [{ id: ctx.scheduleId }],
        },
      },
    });

    if (!scheduleSettings) {
      logger.warn("No plugin found for schedule", {
        scheduleId: ctx.scheduleId,
      });
      return null;
    }

    const pluginId = scheduleSettings.pluginId;
    const loadedPlugin = this.plugins.get(pluginId);

    if (!loadedPlugin) {
      logger.warn("Plugin not loaded", { pluginId });
      return null;
    }

    const isEnabled = await this.isPluginEnabledForUser(pluginId, userId);
    if (!isEnabled) {
      return null;
    }

    const { plugin, manifest } = loadedPlugin;

    if (!plugin.onScheduledTrigger) {
      logger.warn("Plugin does not have onScheduledTrigger hook", { pluginId });
      return null;
    }

    const startTime = Date.now();
    try {
      const context = await createScheduledTriggerContext({
        emailAccount,
        manifest,
        userId,
        pluginId,
        scheduleId: ctx.scheduleId,
        scheduleName: ctx.scheduleName,
        scheduledAt: ctx.scheduledAt,
        data: ctx.data,
      });

      await withTimeout(
        () => plugin.onScheduledTrigger!(context),
        this.hookTimeoutMs,
        pluginId,
        "onScheduledTrigger",
      );

      return {
        pluginId,
        result: null,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error("Plugin onScheduledTrigger error", { pluginId, error });
      return {
        pluginId,
        result: null,
        executionTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute evaluateRule hook across all plugins with automation:rule capability.
   */
  async executeEvaluateRule(
    email: Email,
    emailAccount: EmailAccount,
    userId: string,
    ctx: RuleContextOptions,
  ): Promise<PluginExecutionResult<RuleResult>[]> {
    if (!env.FEATURE_PLUGINS_ENABLED) {
      return [];
    }

    await this.ensureInitialized();

    const capability: PluginCapability = "automation:rule";
    const pluginIds = this.getPluginsWithCapability(capability);
    const results: PluginExecutionResult<RuleResult>[] = [];

    for (const pluginId of pluginIds) {
      const loadedPlugin = this.plugins.get(pluginId);
      if (!loadedPlugin) continue;

      const isEnabled = await this.isPluginEnabledForUser(pluginId, userId);
      if (!isEnabled) continue;

      const { plugin, manifest } = loadedPlugin;

      if (!plugin.evaluateRule) {
        continue;
      }

      const startTime = Date.now();
      try {
        const context = await createRuleContext({
          email,
          emailAccount,
          manifest,
          userId,
          pluginId,
          ruleData: ctx.ruleData,
        });

        const result = await withTimeout(
          () => plugin.evaluateRule!(context),
          this.hookTimeoutMs,
          pluginId,
          "evaluateRule",
        );

        results.push({
          pluginId,
          result,
          executionTimeMs: Date.now() - startTime,
        });
      } catch (error) {
        logger.error("Plugin evaluateRule error", { pluginId, error });
        results.push({
          pluginId,
          result: null,
          executionTimeMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Execute detectFollowup hook across all plugins with followup:detect capability.
   */
  async executeDetectFollowup(
    email: Email,
    emailAccount: EmailAccount,
    userId: string,
  ): Promise<PluginExecutionResult<FollowupResult>[]> {
    if (!env.FEATURE_PLUGINS_ENABLED) {
      return [];
    }

    await this.ensureInitialized();

    const capability: PluginCapability = "followup:detect";
    const pluginIds = this.getPluginsWithCapability(capability);
    const results: PluginExecutionResult<FollowupResult>[] = [];

    for (const pluginId of pluginIds) {
      const loadedPlugin = this.plugins.get(pluginId);
      if (!loadedPlugin) continue;

      const isEnabled = await this.isPluginEnabledForUser(pluginId, userId);
      if (!isEnabled) continue;

      const { plugin, manifest } = loadedPlugin;

      if (!plugin.detectFollowup) {
        continue;
      }

      const startTime = Date.now();
      try {
        const context = await createEmailContext({
          email,
          emailAccount,
          manifest,
          userId,
          pluginId,
        });

        const result = await withTimeout(
          () => plugin.detectFollowup!(context),
          this.hookTimeoutMs,
          pluginId,
          "detectFollowup",
        );

        results.push({
          pluginId,
          result,
          executionTimeMs: Date.now() - startTime,
        });
      } catch (error) {
        logger.error("Plugin detectFollowup error", { pluginId, error });
        results.push({
          pluginId,
          result: null,
          executionTimeMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Execute onCalendarEvent hook across all plugins with calendar:read capability.
   */
  async executeOnCalendarEvent(
    event: CalendarEvent,
    emailAccount: EmailAccount,
    userId: string,
  ): Promise<PluginExecutionResult<void>[]> {
    if (!env.FEATURE_PLUGINS_ENABLED) {
      return [];
    }

    await this.ensureInitialized();

    const capability: PluginCapability = "calendar:read";
    const pluginIds = this.getPluginsWithCapability(capability);
    const results: PluginExecutionResult<void>[] = [];

    for (const pluginId of pluginIds) {
      const loadedPlugin = this.plugins.get(pluginId);
      if (!loadedPlugin) continue;

      const isEnabled = await this.isPluginEnabledForUser(pluginId, userId);
      if (!isEnabled) continue;

      const { plugin, manifest } = loadedPlugin;

      if (!plugin.onCalendarEvent) {
        continue;
      }

      const startTime = Date.now();
      try {
        const context = await createCalendarContext({
          emailAccount,
          manifest,
          userId,
          pluginId,
          event,
        });

        await withTimeout(
          () => plugin.onCalendarEvent!(context),
          this.hookTimeoutMs,
          pluginId,
          "onCalendarEvent",
        );

        results.push({
          pluginId,
          result: null,
          executionTimeMs: Date.now() - startTime,
        });
      } catch (error) {
        logger.error("Plugin onCalendarEvent error", { pluginId, error });
        results.push({
          pluginId,
          result: null,
          executionTimeMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Execute all applicable hooks for a received email.
   * This is a convenience method that runs classify, signal, and followup detection.
   */
  async processReceivedEmail(
    email: Email,
    emailAccount: EmailAccount,
    userId: string,
  ): Promise<{
    classifications: PluginExecutionResult<Classification>[];
    signals: PluginExecutionResult<EmailSignal[]>[];
    followups: PluginExecutionResult<FollowupResult>[];
  }> {
    if (!env.FEATURE_PLUGINS_ENABLED) {
      return { classifications: [], signals: [], followups: [] };
    }

    await this.ensureInitialized();

    // run hooks in parallel for better performance
    const [classifications, signals, followups] = await Promise.all([
      this.executeClassifyEmail(email, emailAccount, userId),
      this.executeOnEmailReceived(email, emailAccount, userId),
      this.executeDetectFollowup(email, emailAccount, userId),
    ]);

    return { classifications, signals, followups };
  }

  /**
   * Get the list of loaded plugins.
   */
  getLoadedPlugins(): Array<{
    id: string;
    manifest: PluginManifest;
    trustLevel: TrustLevel;
    effectiveCapabilities: PluginCapability[];
  }> {
    return Array.from(this.plugins.entries()).map(([id, loaded]) => ({
      id,
      manifest: loaded.manifest,
      trustLevel: loaded.trustLevel,
      effectiveCapabilities: loaded.effectiveCapabilities,
    }));
  }

  /**
   * Get a specific plugin by ID.
   */
  getPlugin(pluginId: string): RuntimeLoadedPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Check if the runtime is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if a specific capability is registered with any plugin.
   */
  hasCapability(capability: PluginCapability): boolean {
    const plugins = this.routingTable.get(capability);
    return plugins !== undefined && plugins.length > 0;
  }

  /**
   * Get all plugins that have a specific capability.
   */
  getPluginsForCapability(capability: PluginCapability): RuntimeLoadedPlugin[] {
    const pluginIds = this.routingTable.get(capability) ?? [];
    return pluginIds
      .map((id) => this.plugins.get(id))
      .filter((p): p is RuntimeLoadedPlugin => p !== undefined);
  }

  /**
   * Get the total number of loaded plugins.
   */
  getPluginCount(): number {
    return this.plugins.size;
  }

  /**
   * Get the current hook timeout setting.
   */
  getHookTimeout(): number {
    return this.hookTimeoutMs;
  }

  /**
   * Get all registered capabilities.
   */
  getRegisteredCapabilities(): Array<{
    id: string;
    pluginId: string;
    name: string;
    description: string;
    routingHints: string[];
  }> {
    return Array.from(this.capabilities.entries()).map(
      ([id, { pluginId, handler }]) => ({
        id,
        pluginId,
        name: handler.name,
        description: handler.description,
        routingHints: handler.routingHints,
      }),
    );
  }

  /**
   * Execute onInit hook for a plugin when enabled for an email account.
   * This should be called when:
   * - A plugin is first enabled for a user/email account
   * - The runtime initializes and finds enabled plugins
   *
   * @param pluginId - Plugin identifier
   * @param emailAccount - Email account to initialize for
   * @param userId - User ID
   * @returns Execution result with timing and any errors
   */
  async executeOnInit(
    pluginId: string,
    emailAccount: EmailAccount,
    userId: string,
  ): Promise<PluginExecutionResult<void> | null> {
    if (!env.FEATURE_PLUGINS_ENABLED) {
      return null;
    }

    await this.ensureInitialized();

    const loadedPlugin = this.plugins.get(pluginId);
    if (!loadedPlugin) {
      logger.warn("Plugin not loaded for onInit", { pluginId });
      return null;
    }

    const { plugin, manifest } = loadedPlugin;

    if (!plugin.onInit) {
      logger.trace("Plugin does not have onInit hook", { pluginId });
      return null;
    }

    const startTime = Date.now();
    try {
      const context = await createInitContext({
        emailAccount,
        manifest,
        userId,
        pluginId,
        inboxZeroVersion: "0.14.0",
      });

      await withTimeout(
        () => plugin.onInit!(context),
        this.hookTimeoutMs,
        pluginId,
        "onInit",
      );

      logger.info("Plugin onInit completed", {
        pluginId,
        emailAccountId: emailAccount.id,
        executionTimeMs: Date.now() - startTime,
      });

      return {
        pluginId,
        result: null,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error("Plugin onInit error", { pluginId, error });
      return {
        pluginId,
        result: null,
        executionTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Reload a specific plugin. Useful for development or after plugin updates.
   */
  async reloadPlugin(pluginId: string): Promise<boolean> {
    if (!env.FEATURE_PLUGINS_ENABLED) {
      return false;
    }

    await this.ensureInitialized();

    // unregister existing plugin
    this.unregisterPlugin(pluginId);

    // try to load from filesystem
    const loaded = await loadPluginById(pluginId);
    if (!loaded) {
      logger.warn("Failed to reload plugin - not found", { pluginId });
      return false;
    }

    // check if still installed
    const installed = await prisma.installedPlugin.findUnique({
      where: { pluginId },
    });

    if (!installed || !installed.enabled) {
      logger.warn("Plugin not installed or disabled", { pluginId });
      return false;
    }

    // re-register
    this.registerPlugin(loaded.manifest, loaded.module);
    logger.info("Plugin reloaded", { pluginId });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Chat Integration
  // ---------------------------------------------------------------------------

  /**
   * Get all chat tools from enabled plugins for a user.
   * Returns a map of tool names to their definitions.
   */
  async getChatTools(
    userId: string,
    _emailAccountId: string,
  ): Promise<
    Map<
      string,
      {
        pluginId: string;
        tool: NonNullable<InboxZeroPlugin["chatTools"]>[string];
      }
    >
  > {
    const tools = new Map<
      string,
      {
        pluginId: string;
        tool: NonNullable<InboxZeroPlugin["chatTools"]>[string];
      }
    >();

    if (!env.FEATURE_PLUGINS_ENABLED) {
      return tools;
    }

    await this.ensureInitialized();

    const capability: PluginCapability = "chat:tool";
    const pluginIds = this.getPluginsWithCapability(capability);

    for (const pluginId of pluginIds) {
      const loadedPlugin = this.plugins.get(pluginId);
      if (!loadedPlugin) continue;

      const isEnabled = await this.isPluginEnabledForUser(pluginId, userId);
      if (!isEnabled) continue;

      const { plugin, manifest } = loadedPlugin;

      if (!plugin.chatTools) continue;

      // prefix tool names with plugin ID to avoid collisions
      for (const [toolName, toolDef] of Object.entries(plugin.chatTools)) {
        const prefixedName = `plugin:${manifest.id}:${toolName}`;
        tools.set(prefixedName, { pluginId, tool: toolDef });
      }
    }

    logger.trace("Collected chat tools", {
      userId,
      toolCount: tools.size,
      tools: Array.from(tools.keys()),
    });

    return tools;
  }

  /**
   * Get chat context from all enabled plugins for a user.
   * Returns array of context objects to be merged into system prompt.
   */
  async getChatContexts(userId: string): Promise<CollectedChatContext[]> {
    const contexts: CollectedChatContext[] = [];

    if (!env.FEATURE_PLUGINS_ENABLED) {
      return contexts;
    }

    await this.ensureInitialized();

    const capability: PluginCapability = "chat:context";
    const pluginIds = this.getPluginsWithCapability(capability);

    for (const pluginId of pluginIds) {
      const loadedPlugin = this.plugins.get(pluginId);
      if (!loadedPlugin) continue;

      const isEnabled = await this.isPluginEnabledForUser(pluginId, userId);
      if (!isEnabled) continue;

      const { plugin, manifest } = loadedPlugin;

      if (!plugin.chatContext) continue;

      contexts.push({
        pluginId,
        pluginName: manifest.name,
        instructions: plugin.chatContext.instructions,
        knowledge: plugin.chatContext.knowledge,
        tone: plugin.chatContext.tone,
      });
    }

    logger.trace("Collected chat contexts", {
      userId,
      contextCount: contexts.length,
      plugins: contexts.map((c) => c.pluginId),
    });

    return contexts;
  }

  /**
   * Get MCP tools from plugins with mcp:expose capability.
   * Tools are hosted internally - no external servers.
   *
   * @param userId - User ID to check plugin enablement
   * @param _emailAccountId - Email account ID (for future use)
   * @returns Map of prefixed tool names to plugin tool definitions
   */
  async getMcpTools(
    userId: string,
    _emailAccountId: string,
  ): Promise<Map<string, { pluginId: string; tool: PluginMcpTool }>> {
    const tools = new Map<string, { pluginId: string; tool: PluginMcpTool }>();

    if (!env.FEATURE_PLUGINS_ENABLED) {
      return tools;
    }

    await this.ensureInitialized();

    const capability: PluginCapability = "mcp:expose";
    const pluginIds = this.getPluginsWithCapability(capability);

    for (const pluginId of pluginIds) {
      const loadedPlugin = this.plugins.get(pluginId);
      if (!loadedPlugin) continue;

      const isEnabled = await this.isPluginEnabledForUser(pluginId, userId);
      if (!isEnabled) continue;

      const { plugin, manifest } = loadedPlugin;
      if (!plugin.mcpTools) continue;

      // prefix tool names to avoid collisions
      for (const [toolName, toolDef] of Object.entries(plugin.mcpTools)) {
        const prefixedName = `plugin:${manifest.id}:${toolName}`;
        tools.set(prefixedName, { pluginId, tool: toolDef });
      }
    }

    logger.trace("Collected MCP tools from plugins", {
      userId,
      toolCount: tools.size,
      tools: Array.from(tools.keys()),
    });

    return tools;
  }

  /**
   * Reset the runtime state. Useful for testing.
   */
  reset(): void {
    this.plugins.clear();
    this.routingTable.clear();
    this.capabilities.clear();
    this.initialized = false;
    pluginEnabledCache.clear();
    logger.info("Plugin runtime reset");
  }

  /**
   * Cleanup expired cache entries and stale plugin data.
   * Call periodically to prevent unbounded memory growth.
   */
  cleanup(): { expiredCacheEntries: number; stalePlugins: number } {
    const expiredCacheEntries = pluginEnabledCache.cleanup();

    // remove plugins that are no longer in the routing table
    let stalePlugins = 0;
    for (const [pluginId] of this.plugins) {
      let hasCapability = false;
      for (const pluginIds of this.routingTable.values()) {
        if (pluginIds.includes(pluginId)) {
          hasCapability = true;
          break;
        }
      }
      if (!hasCapability) {
        this.plugins.delete(pluginId);
        stalePlugins++;
      }
    }

    if (expiredCacheEntries > 0 || stalePlugins > 0) {
      logger.info("Plugin runtime cleanup completed", {
        expiredCacheEntries,
        stalePlugins,
      });
    }

    return { expiredCacheEntries, stalePlugins };
  }

  /**
   * Get current memory stats for monitoring.
   */
  getStats(): {
    loadedPlugins: number;
    capabilities: number;
    registeredCapabilities: number;
    cacheSize: number;
  } {
    return {
      loadedPlugins: this.plugins.size,
      capabilities: this.routingTable.size,
      registeredCapabilities: this.capabilities.size,
      cacheSize: pluginEnabledCache.size,
    };
  }
}

// -----------------------------------------------------------------------------
// Singleton Instance
// -----------------------------------------------------------------------------

export const pluginRuntime = new PluginRuntime();
