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

type IntegrationArgControl =
  | { type: "text" }
  | { type: "select"; options: readonly IntegrationArgOption[] }
  | { type: "remote-select"; source: "todoist-projects" };

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
};

export type IntegrationToolSpec = {
  integration: IntegrationKey;
  tool: string;
  actionLabel: string;
  args: readonly IntegrationArgSpec[];
  buildPayload: (resolved: Record<string, string>) => Record<string, unknown>;
};

export const TODOIST_INBOX_PROJECT_ID = "inbox";
export const TODOIST_INBOX_PROJECT_NAME = "Inbox";

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
  args: [
    {
      key: "content",
      label: "Task",
      control: { type: "text" },
      placeholder: "AI writes a short action item from the email",
      aiPrompt:
        "A short task title describing what the recipient needs to do about this email. Use a few words, not a sentence.",
      required: true,
    },
    {
      key: "description",
      label: "Description",
      control: { type: "text" },
      placeholder: "AI writes one line of context",
      aiPrompt:
        "One short line of context for the task. Return an empty string if the email adds no useful context.",
    },
    {
      key: "projectId",
      label: "Project",
      control: { type: "remote-select", source: "todoist-projects" },
      defaultValue: TODOIST_INBOX_PROJECT_ID,
      defaultDisplayValue: TODOIST_INBOX_PROJECT_NAME,
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
