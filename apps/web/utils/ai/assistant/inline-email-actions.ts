import { z } from "zod";

export const MAX_INLINE_EMAIL_THREAD_IDS = 200;

export const inlineEmailActionTypeSchema = z.enum([
  "archive_threads",
  "mark_read_threads",
]);

export const inlineEmailActionSchema = z.object({
  type: inlineEmailActionTypeSchema,
  threadIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(MAX_INLINE_EMAIL_THREAD_IDS),
});

export type InlineEmailAction = z.infer<typeof inlineEmailActionSchema>;
export type InlineEmailActionType = z.infer<typeof inlineEmailActionTypeSchema>;

export function normalizeInlineEmailThreadIds(threadIds: string[]) {
  const normalizedThreadIds: string[] = [];
  const seenThreadIds = new Set<string>();

  for (let index = threadIds.length - 1; index >= 0; index -= 1) {
    const threadId = threadIds[index]?.trim();
    if (!threadId || seenThreadIds.has(threadId)) continue;

    seenThreadIds.add(threadId);
    normalizedThreadIds.push(threadId);

    if (normalizedThreadIds.length === MAX_INLINE_EMAIL_THREAD_IDS) {
      break;
    }
  }

  return normalizedThreadIds.reverse();
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
    const mergedArchiveThreadIds = normalizeInlineEmailThreadIds([
      ...archiveAction.threadIds,
      ...nextThreadIds,
    ]);
    const archivedNextThreadIds = new Set(
      mergedArchiveThreadIds.filter((threadId) =>
        nextThreadIds.includes(threadId),
      ),
    );
    archiveAction.threadIds = mergedArchiveThreadIds;
    markReadAction.threadIds = markReadAction.threadIds.filter(
      (threadId) => !archivedNextThreadIds.has(threadId),
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
    "These actions already succeeded in the UI. Treat them as authoritative current inbox state for this turn.",
    'If the user follows up with a short confirmation or acknowledgement about these same threads (for example "yes", "sure", "do it", or "thanks"), do not repeat the same archive or mark-read action that already happened in the UI unless they clearly request a different inbox action.',
    "Acknowledge that the action already happened in the UI and continue from the updated state.",
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
