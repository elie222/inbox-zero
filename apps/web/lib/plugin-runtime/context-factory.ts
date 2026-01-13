/**
 * Plugin Context Factory
 *
 * Creates scoped execution contexts for plugins with capability-derived access
 * to email data, LLM services, storage, and calendar.
 *
 * Permissions are automatically derived from capabilities:
 * - email:draft, email:send → full email access (body)
 * - email:classify, email:signal → metadata only (subject, from, snippet)
 * - calendar:write → calendar read + write
 * - calendar:read, calendar:list → calendar read only
 *
 * This provides:
 * - Security: plugins only access data implied by their capabilities
 * - Simplicity: developers declare capabilities, permissions are derived
 * - Least privilege: minimal access for each capability
 */

import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type {
  PluginManifest,
  PluginCapability,
} from "@/packages/plugin-sdk/src/schemas/plugin-manifest";
import {
  derivePermissionsFromCapabilities,
  type EmailPermissionTier,
  type CalendarPermission,
} from "./derived-permissions";
import type {
  EmailContext,
  DraftContext,
  RuleContext,
  CalendarContext,
  TriggeredEmailContext,
  ScheduledTriggerContext,
  PluginEmail,
  PluginEmailAccount,
  PluginLLM,
  PluginStorage,
  PluginCalendar,
  PluginEmailSender,
  CalendarEvent,
} from "@/packages/plugin-sdk/src/types/contexts";
import type { PluginEmailOperations } from "@/packages/plugin-sdk/src/types/email-operations";
import { createScopedLogger } from "@/utils/logger";
import { createGenerateText, createGenerateObject } from "@/utils/llms/index";
import { getModel, type ModelType } from "@/utils/llms/model";
import { createPluginStorage as createPluginStorageImpl } from "./storage-context";
import {
  createPluginCalendar as createPluginCalendarImpl,
  createNoOpPluginCalendar,
} from "./calendar-context";
import { createPluginEmail } from "./email-context";
import { createPluginEmailOperations as createPluginEmailOperationsImpl } from "./email-operations-context";
import prisma from "@/utils/prisma";
import { randomUUID } from "node:crypto";
import { createMcpToolsForAgent } from "@/utils/ai/mcp/mcp-tools";
import { stepCountIs, type ToolSet } from "ai";

const logger = createScopedLogger("plugin-runtime/context");

// -----------------------------------------------------------------------------
// Email Types (internal representation)
// -----------------------------------------------------------------------------

export interface Email {
  id: string;
  threadId?: string;
  subject: string;
  from: string;
  to?: string;
  snippet: string;
  body?: string;
  headers?: Record<string, string>;
  date?: string;
}

export interface EmailAccount {
  id: string;
  email: string;
  provider: "google" | "microsoft";
  userId: string;
  user: {
    aiProvider: string | null;
    aiModel: string | null;
    aiApiKey: string | null;
  };
}

// -----------------------------------------------------------------------------
// Context Factory Options
// -----------------------------------------------------------------------------

export interface ContextFactoryOptions {
  email?: Email;
  emailAccount: EmailAccount;
  manifest: PluginManifest;
  userId: string;
  pluginId: string;
}

// -----------------------------------------------------------------------------
// Main Context Factory Functions
// -----------------------------------------------------------------------------

/**
 * Creates a scoped email context for plugin execution.
 * Access is derived from the plugin's capabilities (not explicit permissions).
 *
 * Capability-derived access:
 * - email:draft, email:send, automation:rule, followup:detect → full email (body)
 * - email:classify, email:signal, email:trigger, email:modify → metadata only
 * - calendar:* → calendar access as appropriate
 * - llm: always available, tier can be specified per-call (defaults to 'chat')
 * - storage: always available, scoped to plugin/user/account
 */
export async function createEmailContext(
  options: ContextFactoryOptions,
): Promise<EmailContext> {
  const { email, emailAccount, manifest, userId, pluginId } = options;

  if (!email) {
    throw new Error("Email is required for email context");
  }

  // derive permissions from capabilities
  const derivedPermissions = derivePermissionsFromCapabilities(
    manifest.capabilities,
  );

  const pluginEmailData = createScopedEmail(email, derivedPermissions.email);
  const pluginEmailAccount = createPluginEmailAccount(emailAccount);
  const llm = createPluginLLM(emailAccount, manifest, pluginId);
  const storage = createPluginStorage(pluginId, userId, emailAccount.id);
  const calendar = await createPluginCalendar(
    emailAccount,
    derivedPermissions.calendar,
    manifest.capabilities,
  );

  return {
    email: pluginEmailData,
    emailAccount: pluginEmailAccount,
    llm,
    storage,
    calendar,
  };
}

/**
 * Creates a draft context with thread information for reply generation.
 * Thread message bodies are included if capabilities imply full email access.
 */
export async function createDraftContext(
  options: ContextFactoryOptions & {
    thread?: Email[];
    preferences?: { tone?: string; signature?: string; language?: string };
  },
): Promise<DraftContext> {
  const baseContext = await createEmailContext(options);

  // derive permissions from capabilities to determine body access
  const derivedPermissions = derivePermissionsFromCapabilities(
    options.manifest.capabilities,
  );
  const hasBodyAccess = derivedPermissions.email === "full";

  return {
    ...baseContext,
    thread: options.thread
      ? {
          id: options.email?.threadId ?? options.email?.id ?? "",
          messages: options.thread.map((msg) => ({
            id: msg.id,
            from: msg.from,
            subject: msg.subject,
            snippet: msg.snippet,
            body: hasBodyAccess ? msg.body : undefined,
            date: msg.date ?? new Date().toISOString(),
          })),
        }
      : undefined,
    preferences: options.preferences,
  };
}

/**
 * Creates a rule evaluation context.
 * Used for custom rule logic that plugins can implement.
 */
export async function createRuleContext(
  options: ContextFactoryOptions & {
    ruleData?: Record<string, unknown>;
  },
): Promise<RuleContext> {
  const { email, emailAccount, manifest, userId, pluginId } = options;

  if (!email) {
    throw new Error("Email is required for rule context");
  }

  // derive permissions from capabilities
  const derivedPermissions = derivePermissionsFromCapabilities(
    manifest.capabilities,
  );

  const pluginEmailData = createScopedEmail(email, derivedPermissions.email);
  const pluginEmailAccount = createPluginEmailAccount(emailAccount);
  const llm = createPluginLLM(emailAccount, manifest, pluginId);
  const storage = createPluginStorage(pluginId, userId, emailAccount.id);

  return {
    email: pluginEmailData,
    emailAccount: pluginEmailAccount,
    llm,
    storage,
    ruleData: options.ruleData,
  };
}

/**
 * Creates a calendar event context.
 * Used when plugins need to respond to calendar events.
 */
export async function createCalendarContext(
  options: Omit<ContextFactoryOptions, "email"> & {
    event: CalendarEvent;
  },
): Promise<CalendarContext> {
  const { emailAccount, manifest, userId, pluginId, event } = options;

  // derive permissions from capabilities
  const derivedPermissions = derivePermissionsFromCapabilities(
    manifest.capabilities,
  );

  const pluginEmailAccount = createPluginEmailAccount(emailAccount);
  const llm = createPluginLLM(emailAccount, manifest, pluginId);
  const storage = createPluginStorage(pluginId, userId, emailAccount.id);
  const calendar = await createPluginCalendar(
    emailAccount,
    derivedPermissions.calendar,
    manifest.capabilities,
  );

  return {
    event,
    emailAccount: pluginEmailAccount,
    llm,
    storage,
    calendar,
  };
}

/**
 * Creates a triggered email context.
 * Used when registered triggers (plus-tags, patterns) match incoming emails.
 *
 * Email sender is ONLY available if the plugin has email:send capability.
 * Email operations is ONLY available if the plugin has email:modify capability.
 */
export async function createTriggeredEmailContext(
  options: ContextFactoryOptions & {
    triggerId: string;
    triggerType: "plus-tag" | "from-pattern" | "subject-pattern" | "custom";
    matchedValue: string;
  },
): Promise<TriggeredEmailContext> {
  const baseContext = await createEmailContext(options);
  const { emailAccount, manifest, pluginId } = options;

  // check if plugin has send_as capability for custom from addresses
  const hasSendAsCapability = manifest.capabilities.includes("email:send_as");

  // email sender: real implementation if capability declared, throwing otherwise
  const emailSender = manifest.capabilities.includes("email:send")
    ? createPluginEmailSender(emailAccount, pluginId, hasSendAsCapability)
    : createThrowingEmailSender();

  // email operations: real implementation if capability declared, throwing otherwise
  const emailOperations = manifest.capabilities.includes("email:modify")
    ? await createPluginEmailOperationsImpl({
        emailAccountId: emailAccount.id,
        provider: emailAccount.provider,
        pluginId,
        userEmail: emailAccount.email,
      })
    : createThrowingEmailOperations();

  return {
    ...baseContext,
    triggerId: options.triggerId,
    triggerType: options.triggerType,
    matchedValue: options.matchedValue,
    emailSender,
    emailOperations,
  };
}

/**
 * Creates a scheduled trigger context.
 * Used when cron-based schedules fire.
 *
 * Email sender is ONLY available if the plugin has email:send capability.
 * Email operations is ONLY available if the plugin has email:modify capability.
 */
export async function createScheduledTriggerContext(
  options: Omit<ContextFactoryOptions, "email"> & {
    scheduleId: string;
    scheduleName: string;
    scheduledAt: Date;
    data?: Record<string, unknown>;
  },
): Promise<ScheduledTriggerContext> {
  const { emailAccount, manifest, userId, pluginId } = options;

  // derive permissions from capabilities
  const derivedPermissions = derivePermissionsFromCapabilities(
    manifest.capabilities,
  );

  const pluginEmailAccount = createPluginEmailAccount(emailAccount);
  const llm = createPluginLLM(emailAccount, manifest, pluginId);
  const storage = createPluginStorage(pluginId, userId, emailAccount.id);
  const calendar = await createPluginCalendar(
    emailAccount,
    derivedPermissions.calendar,
    manifest.capabilities,
  );

  // check if plugin has send_as capability for custom from addresses
  const hasSendAsCapability = manifest.capabilities.includes("email:send_as");

  // email sender: real implementation if capability declared, throwing otherwise
  const emailSender = manifest.capabilities.includes("email:send")
    ? createPluginEmailSender(emailAccount, pluginId, hasSendAsCapability)
    : createThrowingEmailSender();

  // email operations: real implementation if capability declared, throwing otherwise
  const emailOperations = manifest.capabilities.includes("email:modify")
    ? await createPluginEmailOperationsImpl({
        emailAccountId: emailAccount.id,
        provider: emailAccount.provider,
        pluginId,
        userEmail: emailAccount.email,
      })
    : createThrowingEmailOperations();

  return {
    scheduleId: options.scheduleId,
    scheduleName: options.scheduleName,
    scheduledAt: options.scheduledAt,
    data: options.data,
    emailAccount: pluginEmailAccount,
    llm,
    storage,
    calendar,
    emailSender,
    emailOperations,
  };
}

/**
 * Creates an initialization context for plugin setup.
 * Used when a plugin is first enabled for an email account.
 *
 * This context allows plugins to register triggers and schedules during initialization.
 */
export async function createInitContext(
  options: Omit<ContextFactoryOptions, "email"> & {
    inboxZeroVersion: string;
  },
): Promise<import("@/packages/plugin-sdk/src/types/contexts").InitContext> {
  const { emailAccount, manifest, userId, pluginId, inboxZeroVersion } =
    options;

  const pluginEmailAccount = createPluginEmailAccount(emailAccount);
  const llm = createPluginLLM(emailAccount, manifest, pluginId);
  const storage = createPluginStorage(pluginId, userId, emailAccount.id);

  return {
    inboxZeroVersion,
    emailAccount: pluginEmailAccount,
    llm,
    storage,
    async registerTrigger(
      trigger: import("@/packages/plugin-sdk/src/types/contexts").EmailTrigger,
    ): Promise<string> {
      return registerTriggerImpl(pluginId, emailAccount.id, trigger);
    },
    async unregisterTrigger(triggerId: string): Promise<void> {
      return unregisterTriggerImpl(pluginId, emailAccount.id, triggerId);
    },
    async listTriggers(): Promise<
      import("@/packages/plugin-sdk/src/types/contexts").RegisteredTrigger[]
    > {
      return listTriggersImpl(pluginId, emailAccount.id);
    },
    async registerSchedule(
      schedule: import("@/packages/plugin-sdk/src/types/contexts").ScheduleConfig,
    ): Promise<string> {
      return registerScheduleImpl(pluginId, emailAccount.id, schedule);
    },
    async unregisterSchedule(scheduleId: string): Promise<void> {
      return unregisterScheduleImpl(pluginId, emailAccount.id, scheduleId);
    },
    async listSchedules(): Promise<
      import("@/packages/plugin-sdk/src/types/contexts").RegisteredSchedule[]
    > {
      return listSchedulesImpl(pluginId, emailAccount.id);
    },
  };
}

/**
 * Creates a chat tool context for plugin chat tool execution.
 * Provides access to email account, storage, and LLM.
 */
export async function createChatToolContext(
  options: Omit<ContextFactoryOptions, "email">,
): Promise<import("@/packages/plugin-sdk/src/types/chat").ChatToolContext> {
  const { emailAccount, manifest, userId, pluginId } = options;

  const pluginEmailAccount = createPluginEmailAccount(emailAccount);
  const llm = createPluginLLM(emailAccount, manifest, pluginId);
  const storage = createPluginStorage(pluginId, userId, emailAccount.id);

  return {
    emailAccount: pluginEmailAccount,
    llm,
    storage,
  };
}

// -----------------------------------------------------------------------------
// Permission-Gated Email Factory
// -----------------------------------------------------------------------------

/**
 * Creates a scoped email object with only the fields the plugin has permission to access.
 *
 * Permission tiers:
 * - 'none': Only id and headers (minimal required data)
 * - 'metadata': Access to subject, from, to, cc, date, snippet
 * - 'full': Access to all metadata plus body content
 */
function createScopedEmail(
  email: Email,
  tier: EmailPermissionTier | undefined,
): PluginEmail {
  // always include id, threadId, and headers as minimal required data
  const scopedEmail: PluginEmail = {
    id: email.id,
    threadId: email.threadId,
    subject: "",
    from: "",
    snippet: "",
    headers: email.headers ?? {},
  };

  // if no permission tier specified or 'none', return minimal data
  if (!tier || tier === "none") {
    return scopedEmail;
  }

  // metadata tier: include all metadata fields
  if (tier === "metadata" || tier === "full") {
    scopedEmail.subject = email.subject;
    scopedEmail.from = email.from;
    scopedEmail.snippet = email.snippet;
  }

  // full tier: also include body content
  if (tier === "full" && email.body) {
    scopedEmail.body = email.body;
  }

  return scopedEmail;
}

// -----------------------------------------------------------------------------
// Email Account Factory
// -----------------------------------------------------------------------------

/**
 * Creates a plugin email account from internal email account.
 * Only exposes safe, non-sensitive fields.
 */
function createPluginEmailAccount(
  emailAccount: EmailAccount,
): PluginEmailAccount {
  return {
    email: emailAccount.email,
    provider: emailAccount.provider,
  };
}

// -----------------------------------------------------------------------------
// LLM Factory
// -----------------------------------------------------------------------------

/**
 * LLM tier type matching the SDK interface.
 */
type LLMTier = "economy" | "chat" | "reasoning";

/**
 * Creates a scoped LLM interface for plugin use.
 *
 * The tier can be specified per-call by the plugin:
 * - 'economy': cheaper, faster model for simple tasks
 * - 'chat': balanced model for conversational tasks (default)
 * - 'reasoning': most capable model for complex analysis
 *
 * Usage is tracked with label `plugin:{pluginId}` for billing attribution.
 *
 * If the plugin has mcp:access capability, the `generateTextWithTools` method
 * is also available for invoking MCP tools during generation.
 */
function createPluginLLM(
  emailAccount: EmailAccount,
  manifest: PluginManifest,
  pluginId: string,
): PluginLLM {
  const hasMcpAccess = manifest.capabilities.includes(
    "mcp:access" as PluginCapability,
  );
  const label = `plugin:${pluginId}`;

  const emailAccountForLLM: { email: string; id: string; userId: string } = {
    email: emailAccount.email,
    id: emailAccount.id,
    userId: emailAccount.userId,
  };

  // user AI configuration from email account
  const userAi = {
    aiProvider: emailAccount.user.aiProvider,
    aiModel: emailAccount.user.aiModel,
    aiApiKey: emailAccount.user.aiApiKey,
  };

  // helper to get model options for a specific tier
  const getModelForTier = (tier: LLMTier) => {
    return getModel(userAi, tier as ModelType);
  };

  logger.trace("Created plugin LLM", { pluginId, hasMcpAccess });

  const baseLLM: PluginLLM = {
    async generateText(options: {
      prompt: string;
      system?: string;
      tier?: LLMTier;
    }): Promise<string> {
      const tier = options.tier ?? "chat";
      const modelOptions = getModelForTier(tier);

      const generateTextFn = createGenerateText({
        emailAccount: emailAccountForLLM,
        label,
        modelOptions,
      });

      try {
        logger.trace("Plugin generateText", { pluginId, tier });
        const result = await generateTextFn({
          ...modelOptions,
          prompt: options.prompt,
          system: options.system,
        });
        return result.text;
      } catch (error) {
        logger.error("Plugin generateText failed", { pluginId, tier, error });
        throw new PluginLLMError(
          `LLM text generation failed for plugin ${pluginId}`,
          error,
        );
      }
    },

    async generateObject<T>(options: {
      prompt: string;
      schema: z.ZodSchema<T>;
      system?: string;
      tier?: LLMTier;
    }): Promise<{ object: T }> {
      const tier = options.tier ?? "chat";
      const modelOptions = getModelForTier(tier);

      const generateObjectFn = createGenerateObject({
        emailAccount: emailAccountForLLM,
        label,
        modelOptions,
      });

      try {
        logger.trace("Plugin generateObject", { pluginId, tier });
        const result = await generateObjectFn({
          ...modelOptions,
          prompt: options.prompt,
          schema: options.schema,
          system: options.system,
        });
        return { object: result.object as T };
      } catch (error) {
        logger.error("Plugin generateObject failed", { pluginId, tier, error });
        throw new PluginLLMError(
          `LLM object generation failed for plugin ${pluginId}`,
          error,
        );
      }
    },
  };

  // if no MCP access, return base LLM without generateTextWithTools
  if (!hasMcpAccess) {
    return baseLLM;
  }

  // add generateTextWithTools for MCP-enabled plugins
  return {
    ...baseLLM,

    async generateTextWithTools(options: {
      prompt: string;
      system?: string;
      tier?: LLMTier;
      maxSteps?: number;
    }): Promise<{
      text: string;
      toolCalls: Array<{
        toolName: string;
        arguments: Record<string, unknown>;
        result: unknown;
      }>;
    }> {
      const { tools, cleanup } = await createMcpToolsForAgent(emailAccount.id);

      try {
        // if no MCP tools available, fall back to regular generation
        if (Object.keys(tools).length === 0) {
          const text = await baseLLM.generateText({
            prompt: options.prompt,
            system: options.system,
          });
          return { text, toolCalls: [] };
        }

        const tier = options.tier ?? "chat";
        const modelOptions = getModelForTier(tier);
        const maxSteps = Math.min(options.maxSteps ?? 5, 10);

        const generateTextFn = createGenerateText({
          emailAccount: emailAccountForLLM,
          label: `${label}:mcp`,
          modelOptions,
        });

        logger.trace("Plugin generateTextWithTools", {
          pluginId,
          tier,
          toolCount: Object.keys(tools).length,
        });

        const result = await generateTextFn({
          ...modelOptions,
          prompt: options.prompt,
          system: options.system,
          tools: tools as ToolSet,
          stopWhen: stepCountIs(maxSteps),
        });

        // extract tool calls from result steps, matching the mcp-agent pattern
        const toolCalls = result.steps.flatMap((step) =>
          step.toolCalls.map((call) => {
            const toolResult = step.toolResults?.find(
              (r) => r.toolCallId === call.toolCallId,
            );
            return {
              toolName: call.toolName,
              arguments: call.input as Record<string, unknown>,
              result: toolResult?.output,
            };
          }),
        );

        return {
          text: result.text,
          toolCalls,
        };
      } catch (error) {
        logger.error("Plugin generateTextWithTools failed", {
          pluginId,
          error,
        });
        throw new PluginLLMError(
          `LLM text generation with tools failed for plugin ${pluginId}`,
          error,
        );
      } finally {
        await cleanup();
      }
    },
  };
}

/**
 * Error class for plugin LLM operations.
 */
class PluginLLMError extends Error {
  readonly code = "plugin-llm-error";
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "PluginLLMError";
    this.cause = cause;
  }
}

// -----------------------------------------------------------------------------
// Storage Factory
// -----------------------------------------------------------------------------

/**
 * Creates a scoped storage interface for the plugin.
 * Delegates to the full storage implementation in storage-context.ts.
 *
 * Storage is namespaced per-plugin and isolated from other plugins.
 */
function createPluginStorage(
  pluginId: string,
  userId: string,
  emailAccountId: string,
): PluginStorage {
  return createPluginStorageImpl(pluginId, userId, emailAccountId);
}

// -----------------------------------------------------------------------------
// Calendar Factory (Permission-Gated)
// -----------------------------------------------------------------------------

/**
 * Creates a scoped calendar interface for the plugin.
 * Uses the full implementation from calendar-context.ts with Google/Microsoft support.
 *
 * Permission gating:
 * - listCalendars: requires read permission or calendar:read/calendar:list capability
 * - listEvents, getEvent: requires read permission
 * - createEvent, updateEvent, deleteEvent: requires write permission
 *
 * If a plugin attempts an operation without permission, it either:
 * - returns empty data (for list operations)
 * - throws an error (for single-item operations)
 */
async function createPluginCalendar(
  emailAccount: EmailAccount,
  permissions: CalendarPermission[],
  capabilities: PluginCapability[],
): Promise<PluginCalendar> {
  // determine if plugin has any calendar-related permissions
  const hasCalendarPermission =
    permissions.length > 0 ||
    capabilities.includes("calendar:read") ||
    capabilities.includes("calendar:write") ||
    capabilities.includes("calendar:list");

  // if no calendar permissions declared, return no-op calendar
  if (!hasCalendarPermission) {
    return createNoOpPluginCalendar();
  }

  try {
    return await createPluginCalendarImpl({
      emailAccountId: emailAccount.id,
      provider: emailAccount.provider,
      calendarPermissions: permissions,
      capabilities,
    });
  } catch (error) {
    logger.error("Failed to create plugin calendar, falling back to no-op", {
      emailAccountId: emailAccount.id,
      provider: emailAccount.provider,
      error,
    });
    return createNoOpPluginCalendar();
  }
}

/**
 * Error class for plugin calendar operations.
 */
class PluginCalendarError extends Error {
  readonly code = "plugin-calendar-error";

  constructor(message: string) {
    super(message);
    this.name = "PluginCalendarError";
  }
}

// -----------------------------------------------------------------------------
// Email Sender Factory (Capability-Gated)
// -----------------------------------------------------------------------------

/**
 * Creates an email sender interface for the plugin.
 * This is ONLY available if the plugin has the email:send capability.
 *
 * Uses the createPluginEmail implementation that wraps the actual
 * Gmail and Microsoft Graph email sending APIs.
 *
 * The capability check should be done by the caller before invoking this function.
 * This function assumes the capability has already been verified.
 *
 * @param emailAccount - The email account to send from
 * @param pluginId - The plugin ID for tracking
 * @param hasSendAsCapability - Whether the plugin has email:send_as capability
 */
function createPluginEmailSender(
  emailAccount: EmailAccount,
  pluginId: string,
  hasSendAsCapability: boolean,
): PluginEmailSender {
  // use the email-context implementation that wraps the actual email providers
  const pluginEmail = createPluginEmail({
    emailAccountId: emailAccount.id,
    provider: emailAccount.provider,
    pluginId,
    userEmail: emailAccount.email,
    hasSendAsCapability,
  });

  return {
    async send(options: {
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      body: string;
      bodyType?: "text" | "html";
      from?: string;
      replyTo?: string;
    }): Promise<{ messageId: string }> {
      return pluginEmail.send(options);
    },

    async reply(options: {
      threadId: string;
      body: string;
      bodyType?: "text" | "html";
      from?: string;
    }): Promise<{ messageId: string }> {
      return pluginEmail.reply(options);
    },
  };
}

/**
 * Error class for plugin email operations.
 */
class PluginEmailError extends Error {
  readonly code = "plugin-email-error";

  constructor(message: string) {
    super(message);
    this.name = "PluginEmailError";
  }
}

// -----------------------------------------------------------------------------
// Capability Enforcement Error
// -----------------------------------------------------------------------------

/**
 * Error thrown when a plugin attempts to use an API without declaring the required capability.
 * Provides clear error messages to help plugin developers understand what capability they need.
 */
export class PluginCapabilityError extends Error {
  readonly code = "capability-not-declared";
  readonly capability: string;
  readonly operation: string;

  constructor(capability: string, operation: string) {
    super(
      `Plugin attempted to use '${operation}' but did not declare '${capability}' capability in plugin.json. ` +
        `Add "${capability}" to your capabilities array to use this feature.`,
    );
    this.name = "PluginCapabilityError";
    this.capability = capability;
    this.operation = operation;
  }
}

// -----------------------------------------------------------------------------
// Throwing Implementations for Missing Capabilities
// -----------------------------------------------------------------------------

/**
 * Creates a throwing email sender for plugins that haven't declared email:send capability.
 * All methods throw PluginCapabilityError with clear guidance.
 */
function createThrowingEmailSender(): PluginEmailSender {
  const throwError = (): never => {
    throw new PluginCapabilityError(
      "email:send",
      "ctx.email.send() / ctx.email.reply()",
    );
  };

  return {
    send: throwError,
    reply: throwError,
  };
}

/**
 * Creates a throwing email operations interface for plugins that haven't declared email:modify capability.
 * All methods throw PluginCapabilityError with clear guidance on what capability is needed.
 */
function createThrowingEmailOperations(): PluginEmailOperations {
  const throwError = (): never => {
    throw new PluginCapabilityError("email:modify", "ctx.emailOperations.*");
  };

  return {
    applyLabel: throwError,
    removeLabel: throwError,
    moveToFolder: throwError,
    archive: throwError,
    unarchive: throwError,
    markAsRead: throwError,
    markAsUnread: throwError,
    star: throwError,
    unstar: throwError,
    markAsImportant: throwError,
    markAsNotImportant: throwError,
    trash: throwError,
    markAsSpam: throwError,
    createLabel: throwError,
    deleteLabel: throwError,
    listLabels: throwError,
  };
}

// -----------------------------------------------------------------------------
// Trigger and Schedule Registration Implementation
// -----------------------------------------------------------------------------

/**
 * Register a trigger for a plugin.
 * Triggers are stored in PluginAccountSettings.settings.triggers array.
 */
async function registerTriggerImpl(
  pluginId: string,
  emailAccountId: string,
  trigger: import("@/packages/plugin-sdk/src/types/contexts").EmailTrigger,
): Promise<string> {
  const triggerId = randomUUID();

  // strip the matcher function since it cannot be serialized to JSON
  const serializableTrigger = {
    id: triggerId,
    plusTag: trigger.plusTag,
    fromPattern: trigger.fromPattern,
    subjectPattern: trigger.subjectPattern,
  };

  // get existing settings if they exist
  const existing = await prisma.pluginAccountSettings.findUnique({
    where: { pluginId_emailAccountId: { pluginId, emailAccountId } },
  });

  const existingSettings =
    (existing?.settings as Record<string, unknown>) ?? {};
  const existingTriggers = (existingSettings.triggers as unknown[]) ?? [];

  const newSettings = {
    ...existingSettings,
    triggers: [...existingTriggers, serializableTrigger],
  } as Prisma.InputJsonValue;

  await prisma.pluginAccountSettings.upsert({
    where: {
      pluginId_emailAccountId: {
        pluginId,
        emailAccountId,
      },
    },
    create: {
      pluginId,
      emailAccountId,
      settings: newSettings,
    },
    update: {
      settings: newSettings,
    },
  });

  logger.info("Registered trigger", { pluginId, triggerId, emailAccountId });
  return triggerId;
}

/**
 * Unregister a trigger for a plugin.
 */
async function unregisterTriggerImpl(
  pluginId: string,
  emailAccountId: string,
  triggerId: string,
): Promise<void> {
  const existing = await prisma.pluginAccountSettings.findUnique({
    where: { pluginId_emailAccountId: { pluginId, emailAccountId } },
  });

  if (!existing) {
    return;
  }

  const settings = existing.settings as { triggers?: { id: string }[] };
  const triggers = settings.triggers || [];
  const updatedTriggers = triggers.filter((t) => t.id !== triggerId);

  await prisma.pluginAccountSettings.update({
    where: { pluginId_emailAccountId: { pluginId, emailAccountId } },
    data: {
      settings: {
        ...settings,
        triggers: updatedTriggers,
      } as Prisma.InputJsonValue,
    },
  });

  logger.info("Unregistered trigger", { pluginId, triggerId, emailAccountId });
}

/**
 * List all triggers for a plugin.
 */
async function listTriggersImpl(
  pluginId: string,
  emailAccountId: string,
): Promise<
  import("@/packages/plugin-sdk/src/types/contexts").RegisteredTrigger[]
> {
  const settings = await prisma.pluginAccountSettings.findUnique({
    where: { pluginId_emailAccountId: { pluginId, emailAccountId } },
  });

  if (!settings) {
    return [];
  }

  const settingsData = settings.settings as {
    triggers?: Array<{
      id: string;
      plusTag?: string;
      fromPattern?: string;
      subjectPattern?: string;
    }>;
  };
  const triggers = settingsData.triggers || [];

  return triggers.map((t) => ({
    id: t.id,
    pluginId,
    trigger: {
      plusTag: t.plusTag,
      fromPattern: t.fromPattern,
      subjectPattern: t.subjectPattern,
    },
    registeredAt: new Date(),
  }));
}

/**
 * Register a schedule for a plugin.
 * Schedules are stored in PluginAccountSettings.settings.schedules array.
 */
async function registerScheduleImpl(
  pluginId: string,
  emailAccountId: string,
  schedule: import("@/packages/plugin-sdk/src/types/contexts").ScheduleConfig,
): Promise<string> {
  const scheduleId = randomUUID();

  // create a serializable schedule object
  const serializableSchedule = {
    id: scheduleId,
    name: schedule.name,
    cron: schedule.cron,
    timezone: schedule.timezone,
    data: schedule.data,
  };

  // get existing settings if they exist
  const existing = await prisma.pluginAccountSettings.findUnique({
    where: { pluginId_emailAccountId: { pluginId, emailAccountId } },
  });

  const existingSettings =
    (existing?.settings as Record<string, unknown>) ?? {};
  const existingSchedules = (existingSettings.schedules as unknown[]) ?? [];

  const newSettings = {
    ...existingSettings,
    schedules: [...existingSchedules, serializableSchedule],
  } as Prisma.InputJsonValue;

  await prisma.pluginAccountSettings.upsert({
    where: {
      pluginId_emailAccountId: {
        pluginId,
        emailAccountId,
      },
    },
    create: {
      pluginId,
      emailAccountId,
      settings: newSettings,
    },
    update: {
      settings: newSettings,
    },
  });

  logger.info("Registered schedule", { pluginId, scheduleId, emailAccountId });
  return scheduleId;
}

/**
 * Unregister a schedule for a plugin.
 */
async function unregisterScheduleImpl(
  pluginId: string,
  emailAccountId: string,
  scheduleId: string,
): Promise<void> {
  const existing = await prisma.pluginAccountSettings.findUnique({
    where: { pluginId_emailAccountId: { pluginId, emailAccountId } },
  });

  if (!existing) {
    return;
  }

  const settings = existing.settings as { schedules?: { id: string }[] };
  const schedules = settings.schedules || [];
  const updatedSchedules = schedules.filter((s) => s.id !== scheduleId);

  await prisma.pluginAccountSettings.update({
    where: { pluginId_emailAccountId: { pluginId, emailAccountId } },
    data: {
      settings: {
        ...settings,
        schedules: updatedSchedules,
      } as Prisma.InputJsonValue,
    },
  });

  logger.info("Unregistered schedule", {
    pluginId,
    scheduleId,
    emailAccountId,
  });
}

/**
 * List all schedules for a plugin.
 */
async function listSchedulesImpl(
  pluginId: string,
  emailAccountId: string,
): Promise<
  import("@/packages/plugin-sdk/src/types/contexts").RegisteredSchedule[]
> {
  const settings = await prisma.pluginAccountSettings.findUnique({
    where: { pluginId_emailAccountId: { pluginId, emailAccountId } },
  });

  if (!settings) {
    return [];
  }

  const settingsData = settings.settings as {
    schedules?: Array<{
      id: string;
      name: string;
      cron: string;
      timezone?: string;
      data?: Record<string, unknown>;
    }>;
  };
  const schedules = settingsData.schedules || [];

  return schedules.map((s) => ({
    id: s.id,
    pluginId,
    config: {
      name: s.name,
      cron: s.cron,
      timezone: s.timezone,
      data: s.data,
    },
    registeredAt: new Date(),
    nextRunAt: undefined,
  }));
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export { PluginLLMError, PluginCalendarError, PluginEmailError };
