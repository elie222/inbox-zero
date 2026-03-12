import { z } from "zod";

export const MAX_INLINE_EMAIL_THREAD_IDS = 200;

export const inlineEmailActionTypeSchema = z.enum([
  "archive_threads",
  "mark_read_threads",
]);

export const inlineEmailActionSchema = z.object({
  type: inlineEmailActionTypeSchema,
  threadIds: z.array(z.string().min(1)).min(1).max(MAX_INLINE_EMAIL_THREAD_IDS),
});

export type InlineEmailAction = z.infer<typeof inlineEmailActionSchema>;
export type InlineEmailActionType = z.infer<typeof inlineEmailActionTypeSchema>;

export function normalizeInlineEmailThreadIds(threadIds: string[]) {
  return [
    ...new Set(threadIds.filter((threadId) => threadId.trim().length)),
  ].slice(0, MAX_INLINE_EMAIL_THREAD_IDS);
}

export function mergeInlineEmailActions(
  current: InlineEmailAction[],
  next: InlineEmailAction,
): InlineEmailAction[] {
  const nextThreadIds = normalizeInlineEmailThreadIds(next.threadIds);
  if (!nextThreadIds.length) return current;

  const actions = cloneInlineEmailActions(current);
  const archiveAction = findOrCreateAction(actions, "archive_threads");
  const markReadAction = findOrCreateAction(actions, "mark_read_threads");

  if (next.type === "archive_threads") {
    archiveAction.threadIds = normalizeInlineEmailThreadIds([
      ...archiveAction.threadIds,
      ...nextThreadIds,
    ]);
    markReadAction.threadIds = markReadAction.threadIds.filter(
      (threadId) => !nextThreadIds.includes(threadId),
    );
  } else {
    const archivedThreadIds = new Set(archiveAction.threadIds);
    markReadAction.threadIds = normalizeInlineEmailThreadIds([
      ...markReadAction.threadIds,
      ...nextThreadIds.filter((threadId) => !archivedThreadIds.has(threadId)),
    ]);
  }

  return actions.filter((action) => action.threadIds.length > 0);
}

export function buildInlineEmailActionSystemMessage(
  actions?: InlineEmailAction[] | null,
) {
  const normalizedActions = normalizeInlineEmailActions(actions ?? []);
  if (!normalizedActions.length) return null;

  const actionLines = normalizedActions.map((action) => {
    const actionLabel =
      action.type === "archive_threads"
        ? "Archived threads"
        : "Marked read threads";

    return `- ${actionLabel} (${action.threadIds.length}): ${action.threadIds.join(", ")}`;
  });

  return [
    "Hidden UI state update from the user since the last visible message:",
    ...actionLines,
    "",
    "These actions already succeeded in the UI. Do not ask the user to repeat them. If these threads come up again, reflect their updated state.",
  ].join("\n");
}

function normalizeInlineEmailActions(actions: InlineEmailAction[]) {
  return actions.reduce<InlineEmailAction[]>(
    (current, action) => mergeInlineEmailActions(current, action),
    [],
  );
}

function cloneInlineEmailActions(actions: InlineEmailAction[]) {
  return actions.map((action) => ({
    type: action.type,
    threadIds: [...action.threadIds],
  }));
}

function findOrCreateAction(
  actions: InlineEmailAction[],
  type: InlineEmailActionType,
) {
  const existingAction = actions.find((action) => action.type === type);
  if (existingAction) return existingAction;

  const nextAction: InlineEmailAction = { type, threadIds: [] };
  actions.push(nextAction);

  return nextAction;
}
