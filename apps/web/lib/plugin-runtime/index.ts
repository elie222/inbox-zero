/**
 * Plugin Runtime - Core plugin loading and management
 *
 * This module handles plugin discovery, loading, lifecycle management, and hook execution.
 */

// main runtime
export {
  PluginRuntime,
  pluginRuntime,
  type RuntimeLoadedPlugin,
  type PluginExecutionResult,
  type DraftContextOptions,
  type TriggeredEmailContextOptions,
  type ScheduledTriggerContextOptions,
  type RuleContextOptions,
  type PluginRuntimeOptions,
} from "./runtime";

// loader functions
export {
  loadPlugins,
  loadPluginById,
  discoverPlugins,
  getInboxZeroVersion,
} from "./loader";

// constants
export {
  INBOX_ZERO_VERSION,
  CRON_MIN_INTERVAL_MINUTES,
  CRON_MIN_INTERVAL_MS,
  MAX_SCHEDULES_PER_PLUGIN,
  MAX_TRIGGERS_PER_PLUGIN,
  DEFAULT_TIMEZONE,
  MAX_CRON_EXPRESSION_LENGTH,
} from "./constants";

// path resolution utilities
export {
  getPluginSearchPaths,
  getXDGDataHome,
  getXDGCacheHome,
  getExternalPluginsPath,
  getBundledPluginsPath,
  getPluginCachePath,
  getCatalogCachePath,
  resolvePluginPath,
  getManifestPath,
  getEntryPath,
} from "./paths";

// trust system
export {
  getTrustLevel,
  canUseCapability,
  getEffectiveCapabilities,
  getBlockedCapabilities,
  validatePluginCapabilities,
  getTrustLevelDescription,
  getMaxCapabilitiesForTrustLevel,
  CAPABILITY_REQUIREMENTS,
  ALL_CAPABILITIES,
  type TrustLevel,
} from "./trust";

// risk levels
export {
  CAPABILITY_RISK,
  getCapabilityRisk,
  getCapabilityInfo,
  getDangerLevel,
  hasElevatedCapabilities,
  groupCapabilitiesByRisk,
  formatPermissionSummary,
  type CapabilityRisk,
  type DangerLevel,
  type CapabilityInfo,
} from "./risk-levels";

// permission diff
export {
  comparePermissions,
  formatPermissionChangeSummary,
  type PermissionDiff,
  type CapabilityDetail,
} from "./permission-diff";

// context factory
export {
  createEmailContext,
  createDraftContext,
  createRuleContext,
  createCalendarContext,
  createTriggeredEmailContext,
  createScheduledTriggerContext,
  PluginLLMError,
  PluginCalendarError,
  PluginEmailError,
  type Email,
  type EmailAccount,
  type ContextFactoryOptions,
} from "./context-factory";

// calendar context (Google/Microsoft implementations)
export {
  createPluginCalendar,
  createNoOpPluginCalendar,
  type CreatePluginCalendarOptions,
  type CalendarConnectionParams,
} from "./calendar-context";

// email context (Gmail/Microsoft email sending)
export {
  createPluginEmail,
  type SendEmailOptions,
  type ReplyEmailOptions,
  type SendEmailResult,
} from "./email-context";

// storage
export { createPluginStorage, PluginStorageError } from "./storage-context";

// cache utilities
export {
  TtlCache,
  pluginEnabledCache,
  invalidatePluginCache,
  invalidateUserPluginCache,
} from "./cache";

// derived permissions (capability → data access mapping)
export {
  derivePermissionsFromCapabilities,
  getCapabilityDataAccessDescription,
  getEmailPermissionTier,
  requiresCalendarAccess,
  type EmailPermissionTier,
  type CalendarPermission,
  type DerivedPermissions,
} from "./derived-permissions";

// types
export type {
  // core plugin types
  InboxZeroPlugin,
  LoadedPlugin,
  PluginLoadResult,
  // context types
  InitContext,
  EmailContext,
  DraftContext,
  TriggeredEmailContext,
  ScheduledTriggerContext,
  RuleContext,
  CalendarContext,
  // plugin service interfaces
  PluginLLM,
  PluginStorage,
  PluginCalendar,
  PluginEmail,
  PluginEmailAccount,
  // calendar types
  Calendar,
  CalendarEvent,
  CreateEventInput,
  UpdateEventInput,
  // trigger and schedule types
  EmailTrigger,
  ScheduleConfig,
  RegisteredSchedule,
  RegisteredTrigger,
  // result types
  Classification,
  Draft,
  EmailSignal,
  RuleResult,
  FollowupResult,
} from "./types";
