/**
 * Declarative specs for the MCP write tools that rule actions can call.
 *
 * One spec describes a tool's arguments once, and the rule editor, the AI
 * argument-filling pipeline, the executor, validation and history display all
 * read it. `buildPayload` is the only place that knows a tool's wire format.
 *
 * Storage semantics for `Action.integrationArgs`:
 *
 * - Text args: an empty (or absent) value on an arg with `aiPrompt` means the
 *   AI writes the whole value at execution time — the same convention as an
 *   empty `content` on a draft-reply action. A non-empty value is used
 *   literally, unless it contains `{{...}}`, which keeps working as the
 *   power-user template escape hatch.
 * - Select args: the stored value is always one of the option values, so the
 *   choice survives import/export and the v1 API round trip. An option can mean
 *   "let the AI decide" by matching `aiValue`; that is an explicit stored value,
 *   never an absent-vs-empty-string distinction. `buildPayload` maps option
 *   values to what the tool expects.
 *
 * Display-only args (see `displayValueKey`) are stored alongside their arg so
 * the editor and history can show a human label, and are never sent to the tool.
 */

import type { IntegrationKey } from "@/utils/mcp/integrations";

export type IntegrationArgOption = {
  value: string; // stored in Action.integrationArgs
  label: string; // shown in the rule editor
  payloadValue?: string; // sent to the tool; omitted from the payload when absent
};

export type IntegrationArgControl =
  | { type: "text" }
  | { type: "select"; options: readonly IntegrationArgOption[] }
  // Options come from the integration itself: the control names the MCP read
  // tool to call and how to read its response, so no caller needs to know
  // which integration it is talking to.
  | {
      type: "remote-select";
      optionsTool: string; // MCP read tool supplying the options (not the spec's write tool)
      parseOptions: (content: unknown) => IntegrationArgOption[];
      fallbackOptions?: readonly IntegrationArgOption[]; // always offered, even if the fetch fails
    };

export type IntegrationArgSpec = {
  key: string; // key inside Action.integrationArgs
  label: string;
  control: IntegrationArgControl;
  placeholder?: string; // plain-English description of what the AI will write
  aiPrompt?: string; // set => this arg can be filled by the AI at execution time
  aiValue?: string; // select-only: the stored option value meaning "AI decides"
  defaultValue?: string;
  defaultDisplayValue?: string;
  displayValueKey?: string; // companion key holding a human label; never sent to the tool
  required?: boolean; // must resolve to a non-empty value at execution time
  llmDescription?: string; // set => the rule-writing LLM may set this arg
};

export type IntegrationToolSpec = {
  integration: IntegrationKey;
  tool: string;
  actionLabel: string;
  displayArgKey?: string;
  llmDescription: string; // describes the action to the rule-writing LLM
  args: readonly IntegrationArgSpec[];
  buildPayload: (resolved: Record<string, string>) => Record<string, unknown>;
};

// Todoist's virtual inbox: always selectable, even before projects load.
const TODOIST_INBOX_PROJECT: IntegrationArgOption = {
  value: "inbox",
  label: "Inbox",
};

const TODOIST_DUE_DATE_AI_VALUE = "ai";

const TODOIST_DUE_DATE_OPTIONS: readonly IntegrationArgOption[] = [
  { value: TODOIST_DUE_DATE_AI_VALUE, label: "AI decides from email" },
  { value: "none", label: "No due date" },
  { value: "today", label: "Today", payloadValue: "today" },
  { value: "tomorrow", label: "Tomorrow", payloadValue: "tomorrow" },
  { value: "in-7-days", label: "In a week", payloadValue: "in 7 days" },
];

const todoistAddTasksSpec: IntegrationToolSpec = {
  integration: "todoist",
  tool: "add-tasks",
  actionLabel: "Add Todoist task",
  displayArgKey: "content",
  llmDescription:
    "Add a task to the user's Todoist for the matching email. Only use this when the user explicitly asks to create Todoist tasks. Fails if Todoist isn't connected.",
  args: [
    {
      key: "content",
      label: "Task",
      control: { type: "text" },
      placeholder: "AI writes a short action item from the email",
      aiPrompt:
        "A short task title describing what the recipient needs to do about this email. Use a few words, not a sentence.",
      required: true,
      llmDescription:
        "The Todoist task title. Leave empty unless the user asked for specific wording, and the AI writes a task title from each matching email.",
    },
    {
      key: "description",
      label: "Description",
      control: { type: "text" },
      placeholder: "AI writes one line of context",
      aiPrompt:
        "One short line of context for the task. Return an empty string if the email adds no useful context.",
      llmDescription:
        "The Todoist task description. Leave empty unless the user asked for specific wording, and the AI writes one line of context from each matching email.",
    },
    {
      key: "projectId",
      label: "Project",
      control: {
        type: "remote-select",
        optionsTool: "find-projects",
        parseOptions: parseTodoistProjects,
        fallbackOptions: [TODOIST_INBOX_PROJECT],
      },
      defaultValue: TODOIST_INBOX_PROJECT.value,
      defaultDisplayValue: TODOIST_INBOX_PROJECT.label,
      displayValueKey: "projectName",
    },
    {
      key: "dueString",
      label: "Due date",
      control: { type: "select", options: TODOIST_DUE_DATE_OPTIONS },
      defaultValue: TODOIST_DUE_DATE_AI_VALUE,
      aiValue: TODOIST_DUE_DATE_AI_VALUE,
      aiPrompt:
        "The due date the email asks for, in natural language such as 'tomorrow' or 'next Friday'. Return an empty string if the email doesn't mention one.",
      llmDescription:
        "The task due date, e.g. 'today', 'tomorrow' or 'in 7 days'. Leave empty unless the user asked for a specific due date, and the AI takes the due date from each matching email.",
    },
  ],
  buildPayload: (resolved) => {
    const content = resolved.content?.trim() ?? "";
    const description = resolved.description?.trim() ?? "";
    const projectId = resolved.projectId?.trim() ?? "";
    const dueString = resolveSelectPayloadValue(
      TODOIST_DUE_DATE_OPTIONS,
      resolved.dueString,
    );

    // Todoist accepts a batch; rule actions always create exactly one task.
    return {
      tasks: [
        {
          content,
          ...(description && { description }),
          ...(dueString && { dueString }),
          ...(projectId && { projectId }),
        },
      ],
    };
  },
};

export const INTEGRATION_TOOL_SPECS: readonly IntegrationToolSpec[] = [
  todoistAddTasksSpec,
];

export function getIntegrationToolSpec(
  integration: string | null | undefined,
  tool: string | null | undefined,
): IntegrationToolSpec | undefined {
  if (!integration || !tool) return;
  return INTEGRATION_TOOL_SPECS.find(
    (spec) => spec.integration === integration && spec.tool === tool,
  );
}

/**
 * The spec to assume when an action doesn't name its integration and tool
 * (AI- and API-authored actions only carry flat fields). Returns undefined once
 * a second write tool exists, so adding one forces callers to be explicit
 * instead of silently picking whichever spec happens to be first.
 */
export function getOnlyIntegrationToolSpec(): IntegrationToolSpec | undefined {
  return INTEGRATION_TOOL_SPECS.length === 1
    ? INTEGRATION_TOOL_SPECS[0]
    : undefined;
}

const GENERIC_INTEGRATION_ACTION_LABEL = "Add to integration";

/**
 * Names the action after the tool it calls. `ActionType` alone cannot say which
 * integration an action targets, so callers that have the action should pass it.
 */
export function getIntegrationActionLabel(action?: {
  integrationName?: string | null;
  integrationToolName?: string | null;
}): string {
  // Only guess when the action names no tool at all. An action that names an
  // unknown tool must not borrow another integration's label, or previews and
  // history would describe the wrong action.
  const namesTool = !!action?.integrationName || !!action?.integrationToolName;
  const spec = namesTool
    ? getIntegrationToolSpec(
        action?.integrationName,
        action?.integrationToolName,
      )
    : getOnlyIntegrationToolSpec();

  return spec?.actionLabel ?? GENERIC_INTEGRATION_ACTION_LABEL;
}

export function getIntegrationActionDisplayValue(action: {
  integrationName?: string | null;
  integrationToolName?: string | null;
  integrationArgs?: unknown;
}): string | null {
  const namesTool = !!action.integrationName || !!action.integrationToolName;
  const spec = namesTool
    ? getIntegrationToolSpec(action.integrationName, action.integrationToolName)
    : getOnlyIntegrationToolSpec();
  if (!spec?.displayArgKey) return null;

  const args = action.integrationArgs;
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;

  const value = (args as Record<string, unknown>)[spec.displayArgKey];
  return typeof value === "string" ? value.trim() || null : null;
}

/** Read tools the app calls directly to populate a remote-select. */
export function getIntegrationRemoteSelectTools(integration: string): string[] {
  return INTEGRATION_TOOL_SPECS.filter(
    (spec) => spec.integration === integration,
  ).flatMap((spec) =>
    spec.args.flatMap((arg) =>
      arg.control.type === "remote-select" ? [arg.control.optionsTool] : [],
    ),
  );
}

/** Resolves a remote-select arg from untrusted request parameters. */
export function getRemoteSelectArg({
  integration,
  tool,
  argKey,
}: {
  integration: string | null | undefined;
  tool: string | null | undefined;
  argKey: string | null | undefined;
}) {
  const spec = getIntegrationToolSpec(integration, tool);
  if (!spec) return;

  const arg = spec.args.find((candidate) => candidate.key === argKey);
  if (arg?.control.type !== "remote-select") return;

  return { spec, control: arg.control };
}

/**
 * Whether the AI fills this arg at execution time: an empty text arg, or a
 * select sitting on its "AI decides" option.
 */
export function isAiFilledArgValue(
  arg: IntegrationArgSpec | undefined,
  value: string | null | undefined,
): boolean {
  if (!arg?.aiPrompt) return false;

  const trimmed = value?.trim() ?? "";
  if (arg.control.type === "select") return trimmed === arg.aiValue;
  return trimmed === "";
}

/** Args a newly added action starts with, per the spec's declared defaults. */
export function buildDefaultIntegrationArgs(
  spec: IntegrationToolSpec,
): Record<string, string> {
  const args: Record<string, string> = {};

  for (const arg of spec.args) {
    if (arg.defaultValue !== undefined) args[arg.key] = arg.defaultValue;
    if (arg.displayValueKey && arg.defaultDisplayValue !== undefined) {
      args[arg.displayValueKey] = arg.defaultDisplayValue;
    }
  }

  return args;
}

/**
 * Maps a loosely-specified select value (e.g. "in 7 days" from an AI-authored
 * rule) onto the option value we store, so the editor can show the choice.
 */
export function normalizeSelectArgValue(
  arg: IntegrationArgSpec,
  value: string | null | undefined,
): string | undefined {
  if (arg.control.type !== "select") return value?.trim() || undefined;

  const trimmed = value?.trim() ?? "";
  if (!trimmed) return arg.defaultValue;

  const match = arg.control.options.find(
    (option) => option.value === trimmed || option.payloadValue === trimmed,
  );
  return match?.value ?? trimmed;
}

/** A select value guaranteed to match one of the arg's options. */
export function getSelectArgOptionLabel(
  arg: IntegrationArgSpec,
  value: string | null | undefined,
): string | undefined {
  if (arg.control.type !== "select") return;
  const trimmed = value?.trim();
  if (!trimmed) return;
  // A value outside the presets is a custom value (e.g. a due date the user or
  // the AI wrote); show it as-is rather than hiding it behind a preset label.
  return (
    arg.control.options.find((option) => option.value === trimmed)?.label ??
    trimmed
  );
}

/** Keys the spec owns, including display-only companions. */
export function getIntegrationArgKeys(spec: IntegrationToolSpec): string[] {
  return spec.args.flatMap((arg) =>
    arg.displayValueKey ? [arg.key, arg.displayValueKey] : [arg.key],
  );
}

/** Reads Todoist's `find-projects` response into selectable options. */
function parseTodoistProjects(content: unknown): IntegrationArgOption[] {
  if (!Array.isArray(content)) return [];

  const options: IntegrationArgOption[] = [];

  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    if (!("text" in item) || typeof item.text !== "string") continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(item.text);
    } catch {
      continue;
    }

    for (const candidate of extractTodoistProjectArray(parsed)) {
      if (
        candidate &&
        typeof candidate === "object" &&
        "id" in candidate &&
        "name" in candidate &&
        typeof candidate.name === "string"
      ) {
        options.push({ value: String(candidate.id), label: candidate.name });
      }
    }
  }

  return options;
}

function extractTodoistProjectArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  if ("results" in parsed && Array.isArray(parsed.results)) {
    return parsed.results;
  }
  if ("projects" in parsed && Array.isArray(parsed.projects)) {
    return parsed.projects;
  }
  return [];
}

function resolveSelectPayloadValue(
  options: readonly IntegrationArgOption[],
  value: string | null | undefined,
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  const option = options.find((candidate) => candidate.value === trimmed);
  // Unknown values come from AI filling, which returns natural language.
  return option ? (option.payloadValue ?? "") : trimmed;
}
