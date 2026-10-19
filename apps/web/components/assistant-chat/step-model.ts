import type { ChatMessage } from "@/components/assistant-chat/types";
import { formatToolLabel } from "@/components/assistant-chat/tool-label";
import {
  isManageInboxAction,
  type ManageInboxAction,
} from "@/utils/ai/assistant/manage-inbox-actions";
import { getUserVisibleToolFailureMessage } from "@/utils/ai/assistant/chat-response-guard";
import { pluralize } from "@/utils/string";

export type StepStatus = "running" | "done" | "failed";

export type RailStep = {
  key: string;
  kind: "tool" | "reasoning" | "transient";
  status: StepStatus;
  label: string;
  meta?: string;
  /** Reasoning text, for `reasoning` steps. */
  text?: string;
  /** The tool part, for `tool` steps; its result card renders as the detail. */
  part?: ChatMessage["parts"][number];
  /** The step holds a control the user still has to press (a confirm button). */
  needsAction?: boolean;
};

export type Segment =
  | { type: "rail"; key: string; steps: RailStep[] }
  | { type: "part"; key: string; part: ChatMessage["parts"][number] };

export type ToolLikePart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

export type ManageInboxInputForDisplay = {
  action: ManageInboxAction;
  fromEmails?: string[] | null;
  label?: string | null;
  labelName?: string | null;
  read?: boolean | null;
  threadIds?: string[] | null;
};

/** Completed steps in one rail beyond this many are folded. */
export const FOLD_AFTER = 6;
/** Newest completed steps that stay visible when a rail folds. */
export const KEEP_RECENT = 3;

export const STARTING_STEP: RailStep = {
  key: "starting",
  kind: "transient",
  status: "running",
  label: "Starting…",
};

const DECIDING_STEP: RailStep = {
  key: "deciding",
  kind: "transient",
  status: "running",
  label: "Deciding next step…",
};

const MAX_OBJECT_LENGTH = 48;
const MAX_REASON_LENGTH = 80;

export function buildSegments(
  parts: ChatMessage["parts"],
  {
    messageId,
    isStreaming,
  }: {
    messageId: string;
    /** This message is the one the model is writing right now. */
    isStreaming: boolean;
  },
): Segment[] {
  const segments: Segment[] = [];
  const lastIndex = parts.length - 1;

  for (const [index, part] of parts.entries()) {
    const key = `${messageId}-${index}`;
    const step = getRailStep(part, key, isStreaming && index === lastIndex);

    if (step) {
      const current = segments[segments.length - 1];
      if (current?.type === "rail") current.steps.push(step);
      else segments.push({ type: "rail", key, steps: [step] });
      continue;
    }

    if (!isVisibleLoosePart(part)) continue;
    segments.push({ type: "part", key, part });
  }

  const last = segments[segments.length - 1];
  const lastStep = last?.type === "rail" ? last.steps.at(-1) : undefined;
  if (
    isStreaming &&
    last?.type === "rail" &&
    lastStep?.kind === "tool" &&
    lastStep.status !== "running"
  ) {
    last.steps.push(DECIDING_STEP);
  }

  return segments;
}

export function getFoldedSteps(steps: RailStep[]) {
  const foldable = steps.filter(
    (step) => step.status === "done" && !step.needsAction,
  );
  if (foldable.length <= FOLD_AFTER) return new Set<RailStep>();
  return new Set(foldable.slice(0, foldable.length - KEEP_RECENT));
}

export function formatRunFooter(
  metadata: ChatMessage["metadata"],
): string | null {
  if (!metadata) return null;
  const items = [
    metadata.model,
    metadata.thinking && `Thinking ${metadata.thinking}`,
    typeof metadata.durationMs === "number" &&
      `${(metadata.durationMs / 1000).toFixed(1)} s`,
  ].filter(Boolean);
  return items.length > 0 ? items.join(" · ") : null;
}

export function getStepDescriptor(part: ToolLikePart): {
  status: StepStatus;
  label: string;
  meta?: string;
  needsAction?: boolean;
} {
  const labels = getToolLabels(part);

  if (part.state === "input-streaming" || part.state === "input-available") {
    return { status: "running", label: labels.running };
  }

  const failure = getFailure(part);
  if (failure) {
    return { status: "failed", label: labels.failed, meta: failure.reason };
  }

  const pending = needsAction(part.output);
  return {
    status: "done",
    label: labels.done,
    meta: pending ? "waiting for you" : labels.meta,
    needsAction: pending,
  };
}

export function isStepFailed(part: ToolLikePart) {
  return getFailure(part) !== null;
}

export function getManageInboxInputForDisplay(
  input: unknown,
): ManageInboxInputForDisplay | null {
  if (typeof input !== "object" || input === null) return null;

  const value = input as Record<string, unknown>;
  const action = normalizeManageInboxActionForDisplay(value.action);
  if (!action) return null;

  return {
    action,
    fromEmails: getOptionalStringArray(value.fromEmails),
    label: getOptionalString(value.label),
    labelName: getOptionalString(value.labelName ?? value.categoryName),
    read: typeof value.read === "boolean" ? value.read : undefined,
    threadIds: getOptionalStringArray(value.threadIds),
  };
}

export function getManageInboxActionLabel({
  action,
  read,
  labelApplied,
  inProgress,
}: {
  action: ManageInboxAction | undefined;
  read?: boolean;
  labelApplied: boolean;
  inProgress?: boolean;
}) {
  if (action === "bulk_archive_senders") {
    return inProgress ? "Bulk archiving senders" : "Bulk archived senders";
  }
  if (action === "unsubscribe_senders") {
    return inProgress ? "Unsubscribing senders" : "Unsubscribed senders";
  }
  if (action === "archive_threads") {
    if (inProgress) {
      return labelApplied
        ? "Archiving and labeling emails"
        : "Archiving emails";
    }
    return labelApplied ? "Archived and labeled emails" : "Archived emails";
  }
  if (action === "trash_threads") {
    return inProgress ? "Trashing emails" : "Trashed emails";
  }
  if (action === "label_threads") {
    return inProgress ? "Labeling emails" : "Labeled emails";
  }
  if (action === "remove_label_threads") {
    return inProgress ? "Removing labels" : "Removed labels";
  }
  if (action === "mark_read_threads") {
    if (inProgress) {
      return read === false
        ? "Marking emails as unread"
        : "Marking emails as read";
    }
    return read === false ? "Marked emails as unread" : "Marked emails as read";
  }
  return "Updated emails";
}

export function getToolSuccessMessage(output: unknown): string | null {
  if (!isRecord(output)) return null;
  return toMessageString(output.message);
}

function getRailStep(
  part: ChatMessage["parts"][number],
  key: string,
  isLivePart: boolean,
): RailStep | null {
  if (part.type === "reasoning") {
    // Redacted or empty reasoning has nothing to show.
    if (!part.text || part.text === "[REDACTED]") return null;
    const live = isLivePart && part.state !== "done";
    return {
      key,
      kind: "reasoning",
      status: live ? "running" : "done",
      label: live ? "Thinking…" : "Thought",
      text: part.text,
    };
  }

  if (!part.type.startsWith("tool-")) return null;

  const toolPart = part as unknown as ToolLikePart;
  return {
    key: toolPart.toolCallId || key,
    kind: "tool",
    part,
    ...getStepDescriptor(toolPart),
  };
}

function isVisibleLoosePart(part: ChatMessage["parts"][number]) {
  if (part.type === "text") return part.text.trim().length > 0;
  return part.type === "file";
}

function getFailure(part: ToolLikePart): { reason?: string } | null {
  if (part.state === "output-error") {
    return { reason: shorten(part.errorText, MAX_REASON_LENGTH) };
  }
  const { output } = part;
  if (!isRecord(output)) return null;
  if (!("error" in output) && output.success !== false) return null;
  return {
    reason: shorten(
      getUserVisibleToolFailureMessage(output) ?? undefined,
      MAX_REASON_LENGTH,
    ),
  };
}

function needsAction(output: unknown) {
  if (!isRecord(output) || output.requiresConfirmation !== true) return false;
  const state = output.confirmationState ?? "pending";
  return state === "pending" || state === "processing";
}

type ToolLabels = {
  running: string;
  done: string;
  failed: string;
  meta?: string;
};

type Words = readonly [now: string, past: string, bare: string];

const LOAD: Words = ["Loading", "Loaded", "load"];
const READ: Words = ["Reading", "Read", "read"];
const SEARCH: Words = ["Searching", "Searched", "search"];
const UPDATE: Words = ["Updating", "Updated", "update"];
const CHECK: Words = ["Checking", "Checked", "check"];
const PREPARE: Words = ["Preparing", "Prepared", "prepare"];
const CREATE: Words = ["Creating", "Created", "create"];

function getToolLabels(part: ToolLikePart): ToolLabels {
  const type = part.type.replace(/^tool-/, "");
  const { input, output } = part;

  switch (type) {
    case "getAccountOverview":
      return plain(LOAD, "account overview");
    case "getAssistantCapabilities":
      return plain(LOAD, "assistant capabilities");
    case "updateAssistantSettings": {
      const changes = getField<unknown[]>(output, "appliedChanges");
      return plain(
        UPDATE,
        "settings",
        Array.isArray(changes) ? count(changes.length, "change") : undefined,
      );
    }
    case "searchInbox":
      return getSearchInboxLabels(input, output);
    case "readEmail": {
      const subject = shorten(getField<string>(output, "subject"));
      return plain(READ, "email", undefined, subject && `email "${subject}"`);
    }
    case "readAttachment": {
      const filename = shorten(getField<string>(input, "filename"));
      return plain(READ, filename ? `attachment ${filename}` : "attachment");
    }
    case "manageInbox":
      return getManageInboxLabels(input, output);
    case "sendEmail":
      return plain(PREPARE, "email");
    case "replyEmail":
      return plain(PREPARE, "reply");
    case "forwardEmail":
      return plain(PREPARE, "forward");
    case "getUserRulesAndSettings":
      return plain(READ, "rules and settings");
    case "getRuleExecutionForMessage":
      return plain(READ, "rule execution details");
    case "getLearnedPatterns":
      return plain(READ, "learned patterns");
    case "runRulesOnEmail":
      return getRunRulesLabels(input, output);
    case "createRule":
      return plain(CREATE, quoted("rule", getField(input, "name")));
    case "updateRule":
      return plain(UPDATE, quoted("rule", getField(input, "ruleName")));
    case "updateRuleConditions":
      return plain(
        UPDATE,
        `conditions of ${quoted("rule", getField(input, "ruleName"))}`,
      );
    case "updateRuleActions":
      return plain(
        UPDATE,
        `actions of ${quoted("rule", getField(input, "ruleName"))}`,
      );
    case "deleteRule":
      return getDeleteRuleLabels(
        quoted("rule", getField(input, "ruleName")),
        output,
      );
    case "updateRuleState":
      return getRuleStateLabels(input, output);
    case "updateLearnedPatterns":
      return plain(
        UPDATE,
        `learned patterns for ${quoted("rule", getField(input, "ruleName"))}`,
      );
    case "updatePersonalInstructions":
      return plain(UPDATE, "personal instructions");
    case "addToKnowledgeBase":
      return plain(["Adding", "Added", "add"], "to knowledge base");
    case "saveMemory":
      return plain(["Saving", "Saved", "save"], "memory");
    case "searchMemories": {
      const memories = getField<unknown[]>(output, "memories");
      return plain(
        SEARCH,
        "memories",
        Array.isArray(memories) ? `${memories.length} found` : undefined,
      );
    }
    case "getCalendarEvents":
      return plain(CHECK, "calendar");
    case "getSenderCategoryOverview":
      return plain(
        CHECK,
        "sender categories",
        getSenderCategoryOverviewMeta(output),
      );
    case "startSenderCategorization":
      return plain(
        ["Starting", "Started", "start"],
        "sender categorization",
        getStartSenderCategorizationMeta(output),
      );
    case "getSenderCategorizationStatus":
      return plain(
        CHECK,
        "categorization progress",
        getSenderCategorizationStatusMeta(output),
      );
    case "manageSenderCategory": {
      const name = shorten(getField<string>(input, "categoryName")?.trim());
      const senders = getField<number>(output, "sendersCount");
      return plain(
        ["Archiving", "Archived", "archive"],
        name ? `"${name}" category` : "category",
        typeof senders === "number"
          ? senders === 0
            ? "no senders to archive"
            : count(senders, "sender")
          : undefined,
      );
    }
    default: {
      const label = formatToolLabel(part.type);
      return {
        running: `Running ${label}…`,
        done: getToolSuccessMessage(output) ?? `Completed ${label}`,
        failed: `Couldn't run ${label}`,
      };
    }
  }
}

function plain(
  [now, past, bare]: Words,
  object: string,
  meta?: string,
  doneObject = object,
): ToolLabels {
  return {
    running: `${now} ${object}…`,
    done: `${past} ${doneObject}`,
    failed: `Couldn't ${bare} ${object}`,
    meta,
  };
}

function getSearchInboxLabels(input: unknown, output: unknown): ToolLabels {
  const query = shorten(
    getField<string>(input, "query") ||
      getField<string>(input, "fromEmail") ||
      getField<string>(input, "folderName") ||
      getField<string>(input, "categoryName"),
  );
  const messages = getField<unknown[]>(output, "messages");
  const more = getField<boolean>(output, "hasMore") ? "+" : "";
  const meta = Array.isArray(messages)
    ? messages.length === 0
      ? "no emails"
      : `${messages.length}${more} ${pluralize(messages.length, "email")}`
    : undefined;
  return plain(SEARCH, query ? `inbox for ${query}` : "inbox", meta);
}

function getManageInboxLabels(input: unknown, output: unknown): ToolLabels {
  const parsed = getManageInboxInputForDisplay(input);
  const action =
    parsed?.action ?? getField<ManageInboxAction>(output, "action");
  const labelApplied =
    parsed?.action === "archive_threads"
      ? Boolean(parsed.label)
      : Boolean(parsed?.label || parsed?.labelName);
  const read = parsed?.read ?? true;
  const base = { action, read, labelApplied };

  const isSenderAction =
    action === "bulk_archive_senders" || action === "unsubscribe_senders";
  const done = isSenderAction
    ? (getField<number>(output, "sendersCount") ??
      getField<string[]>(output, "senders")?.length)
    : (getField<number>(output, "successCount") ??
      getField<number>(output, "requestedCount"));
  const failed = getField<number>(output, "failedCount");
  const noun = isSenderAction ? "sender" : "email";
  const meta = [
    typeof done === "number" ? count(done, noun) : undefined,
    failed ? `${failed} failed` : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    running: `${getManageInboxActionLabel({ ...base, inProgress: true })}…`,
    done: getManageInboxActionLabel(base),
    failed: `Couldn't ${getManageInboxBareVerb(action, read)}`,
    meta: meta || undefined,
  };
}

function getManageInboxBareVerb(
  action: ManageInboxAction | undefined,
  read: boolean,
) {
  switch (action) {
    case "bulk_archive_senders":
      return "bulk archive senders";
    case "unsubscribe_senders":
      return "unsubscribe senders";
    case "archive_threads":
      return "archive emails";
    case "trash_threads":
      return "trash emails";
    case "label_threads":
      return "label emails";
    case "remove_label_threads":
      return "remove labels";
    case "mark_read_threads":
      return read ? "mark emails as read" : "mark emails as unread";
    default:
      return "update emails";
  }
}

function getRunRulesLabels(input: unknown, output: unknown): ToolLabels {
  const apply = getField<boolean>(input, "apply") === true;
  const results = getField<Array<{ ruleName?: string | null }>>(
    output,
    "results",
  );
  const rule = Array.isArray(results)
    ? shorten(results.find((result) => result.ruleName)?.ruleName ?? undefined)
    : undefined;
  return {
    running: apply ? "Running your rules…" : "Previewing your rules…",
    done: apply ? "Ran your rules" : "Previewed your rules",
    failed: apply ? "Couldn't run your rules" : "Couldn't preview your rules",
    meta: Array.isArray(results)
      ? rule
        ? `matched ${rule}`
        : "no rule matched"
      : undefined,
  };
}

function getDeleteRuleLabels(object: string, output: unknown): ToolLabels {
  const confirming = getField<boolean>(output, "requiresConfirmation") === true;
  return {
    running: `Preparing to delete ${object}…`,
    done: confirming ? `Prepared to delete ${object}` : `Deleted ${object}`,
    failed: `Couldn't delete ${object}`,
  };
}

function getRuleStateLabels(input: unknown, output: unknown): ToolLabels {
  const operation = getField<string>(input, "operation");
  const object = quoted("rule", getField(input, "ruleName"));
  if (operation === "delete") return getDeleteRuleLabels(object, output);
  const enable = operation === "enable";
  return plain(
    enable
      ? ["Enabling", "Enabled", "enable"]
      : ["Disabling", "Disabled", "disable"],
    object,
  );
}

function quoted(noun: string, name: unknown) {
  const value = typeof name === "string" ? shorten(name) : undefined;
  return value ? `${noun} "${value}"` : noun;
}

function count(n: number, noun: string) {
  return `${n} ${pluralize(n, noun)}`;
}

function shorten(value: string | undefined | null, max = MAX_OBJECT_LENGTH) {
  const text = value?.trim().replace(/\.$/, "");
  if (!text) return;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function getSenderCategoryOverviewMeta(output: unknown) {
  const categories = getField<unknown[]>(output, "categories");
  const categoryCount = Array.isArray(categories) ? categories.length : 0;
  const uncategorized =
    getField<number>(output, "uncategorizedSenderCount") ?? 0;

  if (categoryCount === 0 && uncategorized === 0) return "none yet";

  const parts: string[] = [];
  if (categoryCount > 0) {
    parts.push(
      `${categoryCount} ${pluralize(categoryCount, "category", "categories")}`,
    );
  }
  if (uncategorized > 0) {
    parts.push(`${uncategorized} uncategorized`);
  }
  return parts.join(", ");
}

function getStartSenderCategorizationMeta(output: unknown) {
  if (getField<boolean>(output, "alreadyRunning")) return "already running";
  const queued = getField<number>(output, "totalQueuedSenders") ?? 0;
  return queued > 0 ? count(queued, "sender") : "no senders to categorize";
}

function getSenderCategorizationStatusMeta(output: unknown) {
  const status = getField<string>(output, "status");
  const total = getField<number>(output, "totalItems") ?? 0;
  const completed = getField<number>(output, "completedItems") ?? 0;
  if (status === "completed") return "complete";
  if (status === "running") return `${completed} of ${total}`;
  return "not started";
}

function normalizeManageInboxActionForDisplay(action: unknown) {
  if (typeof action !== "string") return;
  if (action === "categorize_threads") return "label_threads";
  if (action === "remove_category_threads") return "remove_label_threads";
  return isManageInboxAction(action) ? action : undefined;
}

function getOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function getOptionalStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function getField<T>(value: unknown, field: string): T | undefined {
  if (isRecord(value) && field in value) return value[field] as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toMessageString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (
    isRecord(value) &&
    typeof value.message === "string" &&
    value.message.trim().length > 0
  ) {
    return value.message;
  }
  return null;
}
