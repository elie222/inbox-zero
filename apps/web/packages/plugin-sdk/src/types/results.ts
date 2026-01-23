/**
 * Result types for plugin hook return values
 */

/**
 * Classification result from classifyEmail hook
 */
export interface Classification {
  /** Classification label (e.g., 'Needs Follow-up', 'Important', 'Newsletter') */
  label: string;

  /** Confidence score between 0 and 1 */
  confidence: number;

  /** Optional explanation for the classification */
  reason?: string;

  /** Optional metadata for downstream processing */
  metadata?: Record<string, unknown>;
}

/**
 * Draft result from draftReply hook
 */
export interface Draft {
  /** Draft body content (text or HTML based on bodyType) */
  body: string;

  /** Content type of the body */
  bodyType?: "text" | "html";

  /** Confidence score between 0 and 1 */
  confidence: number;

  /** Optional suggested subject line (for new emails or modified subjects) */
  subject?: string;

  /** Optional CC recipients to suggest */
  suggestedCc?: string[];

  /**
   * Optional sender address override (plus-tag variant).
   *
   * **Requires `email:send_as` capability.**
   *
   * Must be a plus-tag variant of the user's registered email address.
   * For example, if user's email is `jordan@company.com`, valid values are:
   * - `jordan+assistant@company.com`
   * - `jordan+finley@company.com`
   *
   * This enables:
   * - Automatic routing of replies to the assistant
   * - Clear identity in email conversations
   * - Assistant-to-assistant collision detection via email patterns
   *
   * @example
   * ```typescript
   * return {
   *   body: 'I will follow up on this.',
   *   confidence: 0.9,
   *   from: 'jordan+finley@company.com',
   * };
   * ```
   */
  from?: string;

  /**
   * Optional reply-to address.
   *
   * When set, replies to this email will be directed to this address
   * instead of the from address.
   */
  replyTo?: string;

  /** Optional explanation for the draft */
  reason?: string;

  /** Optional metadata for downstream processing */
  metadata?: Record<string, unknown>;
}

/**
 * Signal emitted by onEmailReceived hook for automation
 */
export interface EmailSignal {
  /** Signal type identifier (e.g., 'needs-followup', 'urgent', 'promotion') */
  type: string;

  /** Signal strength/confidence between 0 and 1 */
  strength: number;

  /** Optional payload for automation rules */
  payload?: Record<string, unknown>;

  /** Optional human-readable description */
  description?: string;
}

/**
 * Result from evaluateRule hook for custom rule logic
 */
export interface RuleResult {
  /** Whether the rule matches */
  matches: boolean;

  /** Confidence score between 0 and 1 (when matches is true) */
  confidence?: number;

  /** Optional explanation for the match result */
  reason?: string;

  /** Optional actions to take if rule matches */
  suggestedActions?: RuleSuggestedAction[];

  /** Optional metadata for logging/debugging */
  metadata?: Record<string, unknown>;
}

/**
 * Suggested action from rule evaluation
 */
export interface RuleSuggestedAction {
  /** Action type (e.g., 'label', 'archive', 'forward', 'draft-reply') */
  type: string;

  /** Action-specific parameters */
  params?: Record<string, unknown>;
}

/**
 * Result from detectFollowup hook
 */
export interface FollowupResult {
  /** Whether follow-up is needed */
  needsFollowup: boolean;

  /** Confidence score between 0 and 1 */
  confidence: number;

  /** Suggested follow-up date/time */
  suggestedDate?: Date;

  /** Reason for follow-up (or why not needed) */
  reason?: string;

  /** Priority level for the follow-up */
  priority?: "low" | "medium" | "high" | "urgent";

  /** Suggested follow-up action */
  suggestedAction?: FollowupSuggestedAction;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Suggested follow-up action
 */
export interface FollowupSuggestedAction {
  /** Action type */
  type: "reminder" | "draft-reply" | "calendar-event" | "task";

  /** Suggested content/description for the action */
  description?: string;

  /** Action-specific parameters */
  params?: Record<string, unknown>;
}

/**
 * Result from calendar event hooks
 */
export interface CalendarEventResult {
  /** Whether the hook handled the event */
  handled: boolean;

  /** Actions taken */
  actions?: CalendarAction[];

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Calendar action taken by plugin
 */
export interface CalendarAction {
  /** Action type */
  type: "created-event" | "updated-event" | "sent-email" | "other";

  /** Description of what was done */
  description: string;

  /** Related resource ID (e.g., event ID, email ID) */
  resourceId?: string;
}

/**
 * Aggregate result from multiple plugins for classification
 */
export interface AggregatedClassification {
  /** Source plugin ID */
  pluginId: string;

  /** Classification result */
  classification: Classification;

  /** Execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * Aggregate result from multiple plugins for signals
 */
export interface AggregatedSignals {
  /** Source plugin ID */
  pluginId: string;

  /** Signals emitted */
  signals: EmailSignal[];

  /** Execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * Error result when a plugin hook fails
 */
export interface PluginError {
  /** Plugin ID that errored */
  pluginId: string;

  /** Hook that failed */
  hook: string;

  /** Error message */
  message: string;

  /** Error code for categorization */
  code?: string;

  /** Whether the error is recoverable */
  recoverable: boolean;

  /** Stack trace (only in development) */
  stack?: string;
}

/**
 * Batch result for operations that run multiple plugins
 */
export interface BatchPluginResult<T> {
  /** Successful results */
  results: Array<{
    pluginId: string;
    result: T;
    executionTimeMs: number;
  }>;

  /** Errors from failed plugins */
  errors: PluginError[];

  /** Total execution time in milliseconds */
  totalExecutionTimeMs: number;
}
