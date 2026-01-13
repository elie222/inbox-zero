// LLM types
export type {
  PluginLLM,
  GenerateTextOptions,
  GenerateObjectOptions,
  GenerateObjectResult,
  GenerateTextWithToolsOptions,
  GenerateTextWithToolsResult,
  ToolCallResult,
  LLMTier,
} from "./llm";

// Storage types
export type { PluginStorage } from "./storage";

// Email sending types
export type {
  PluginEmail,
  SendEmailOptions,
  ReplyEmailOptions,
  SendEmailResult,
} from "./email";

// Calendar types
export type {
  PluginCalendar,
  Calendar,
  CalendarEvent,
  CalendarEventAttendee,
  CalendarEventOrganizer,
  CalendarDateTime,
  CalendarEventStatus,
  AttendeeResponseStatus,
  ListEventsOptions,
  GetBusyPeriodsOptions,
  ListEventsWithAttendeeOptions,
  BusyPeriod,
  CreateEventInput,
  UpdateEventInput,
  RespondToEventInput,
} from "./calendar";

// Trigger types
export type {
  EmailForPlugin,
  EmailAttachment,
  EmailTrigger,
  RegisteredTrigger,
  ScheduleConfig,
  RegisteredSchedule,
  InitContext,
} from "./triggers";

// Context types
export type {
  EmailProvider,
  PluginEmail as PluginEmailData,
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
} from "./contexts";

// Result types
export type {
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
} from "./results";

// Email operations types
export type {
  PluginEmailOperations,
  LabelOperationResult,
  ModifyOperationResult,
} from "./email-operations";

// Chat types
export type {
  ChatToolContext,
  PluginChatTool,
  PluginChatContext,
  PluginChatTools,
} from "./chat";

// MCP types
export type { PluginMcpTool, PluginMcpTools } from "./mcp";
