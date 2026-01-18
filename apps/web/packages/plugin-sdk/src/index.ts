/**
 * @inbox-zero/plugin-sdk
 *
 * SDK for building Inbox Zero plugins.
 *
 * @example
 * ```typescript
 * import { definePlugin } from '@inbox-zero/plugin-sdk';
 *
 * export default definePlugin({
 *   async classifyEmail(ctx) {
 *     if (ctx.email.subject.toLowerCase().includes('following up')) {
 *       return { label: 'Needs Follow-up', confidence: 0.82 };
 *     }
 *
 *     const result = await ctx.llm.generateObject({
 *       schema: followupSchema,
 *       prompt: `Analyze if this email needs follow-up: ${ctx.email.snippet}`,
 *     });
 *     return result.object;
 *   },
 *
 *   async draftReply(ctx) {
 *     const draft = await ctx.llm.generateText({
 *       prompt: `Draft a follow-up reply for: ${ctx.email.subject}`,
 *     });
 *     return { body: draft, confidence: 0.9 };
 *   },
 * });
 * ```
 */

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

export {
  definePlugin,
  type PluginType,
  type PartialPlugin,
} from "./helpers/define-plugin";

export {
  defineCapability,
  type CapabilityType,
  type PartialCapability,
} from "./helpers/define-capability";

// -----------------------------------------------------------------------------
// Core Plugin Interface
// -----------------------------------------------------------------------------

export type { InboxZeroPlugin } from "./types/plugin";

// -----------------------------------------------------------------------------
// All Types (re-export from types barrel)
// -----------------------------------------------------------------------------

export type {
  // LLM types
  PluginLLM,
  GenerateTextOptions,
  GenerateObjectOptions,
  GenerateObjectResult,
  GenerateTextWithToolsOptions,
  GenerateTextWithToolsResult,
  ToolCallResult,
  LLMTier,
  // Storage types
  PluginStorage,
  // Email sending types (PluginEmail here is the sender interface)
  PluginEmail,
  SendEmailOptions,
  ReplyEmailOptions,
  SendEmailResult,
  // Calendar types
  PluginCalendar,
  Calendar,
  CalendarEvent,
  CalendarEventAttendee,
  CalendarEventOrganizer,
  CalendarDateTime,
  CalendarEventStatus,
  AttendeeResponseStatus,
  ListEventsOptions,
  CreateEventInput,
  UpdateEventInput,
  // Trigger types
  EmailForPlugin,
  EmailAttachment,
  EmailTrigger,
  RegisteredTrigger,
  ScheduleConfig,
  RegisteredSchedule,
  InitContext,
  // Context types
  EmailProvider,
  PluginEmailData,
  PluginEmailAccount,
  CalendarAttendee,
  PluginEmailSender,
  BaseContext,
  EmailContext,
  DraftContext,
  RuleContext,
  CalendarContext,
  TriggerType,
  TriggeredEmailContext,
  ScheduledTriggerContext,
  // Result types
  Classification,
  Draft,
  EmailSignal,
  RuleResult,
  RuleSuggestedAction,
  FollowupResult,
  FollowupSuggestedAction,
  CalendarEventResult,
  CalendarAction,
  AggregatedClassification,
  AggregatedSignals,
  PluginError,
  BatchPluginResult,
  // Email operations types
  PluginEmailOperations,
  LabelOperationResult,
  ModifyOperationResult,
  // Chat types
  ChatToolContext,
  PluginChatTool,
  PluginChatContext,
  PluginChatTools,
  // MCP types
  PluginMcpTool,
  PluginMcpTools,
  // Capability types
  CapabilityHandler,
  CapabilityContext,
  CapabilityResult,
  CapabilityAction,
  CapabilityActionType,
  CapabilityExplanation,
} from "./types";

// -----------------------------------------------------------------------------
// Manifest Schemas and Types
// -----------------------------------------------------------------------------

export {
  // schemas
  pluginManifestSchema,
  pluginCapabilitySchema,
  pluginPermissionsSchema,
  pluginLlmConfigSchema,
  pluginConfigSchema,
  pluginLibraryMetadataSchema,
  pluginIconSchema,
  inboxZeroRequirementsSchema,
  emailPermissionTierSchema,
  calendarPermissionSchema,
  llmTierSchema,
  pluginSettingsSchema,
  settingsPropertySchema,
  settingsUiSchema,
  settingsUiSectionSchema,
  // parsing utilities
  parsePluginManifest,
  safeParsePluginManifest,
  // types
  type PluginManifest,
  type PluginCapability,
  type PluginPermissions,
  type PluginLlmConfig,
  type PluginConfig,
  type PluginLibraryMetadata,
  type PluginIcon,
  type InboxZeroRequirements,
  type EmailPermissionTier,
  type CalendarPermission,
  type LlmTier,
  type PluginSettings,
  type SettingsProperty,
  type SettingsUi,
  type SettingsUiSection,
} from "./schemas/plugin-manifest";
