import { z } from "zod";

const MAX_SCREEN_THREAD_IDS = 100;

export const mailScreenActionInputSchema = z.object({
  action: z
    .enum(["select_threads", "open_thread", "search"])
    .describe(
      "select_threads: select these threads in the list, replacing the current selection. open_thread: open one thread in the reader. search: show search results in the list.",
    ),
  threadIds: z
    .array(z.string().trim().min(1))
    .max(MAX_SCREEN_THREAD_IDS)
    .nullish()
    .describe(
      `Thread IDs from searchInbox or the mail screen state. Required for select_threads (up to ${MAX_SCREEN_THREAD_IDS}) and open_thread (exactly one).`,
    ),
  query: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .nullish()
    .describe(
      "Required for search. Uses the same query syntax as searchInbox's query.",
    ),
});

export type MailScreenAction =
  | { action: "select_threads"; threadIds: string[] }
  | { action: "open_thread"; threadId: string }
  | { action: "search"; query: string }
  // Sent by the client after the assistant creates or edits a split, never by
  // the model, so parseMailScreenAction doesn't accept it.
  | { action: "show_split"; splitId: string; emailAccountId: string };

/**
 * The browser applies an action as soon as the model emits it, before the
 * server's result arrives, so both sides validate with this.
 */
export function parseMailScreenAction(
  input: unknown,
): MailScreenAction | { error: string } {
  const parsed = mailScreenActionInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid mail screen action." };

  const { action, threadIds, query } = parsed.data;
  switch (action) {
    case "select_threads":
      if (!threadIds?.length)
        return { error: "select_threads requires threadIds." };
      return { action, threadIds: [...new Set(threadIds)] };
    case "open_thread":
      if (threadIds?.length !== 1)
        return { error: "open_thread requires exactly one threadId." };
      return { action, threadId: threadIds[0] };
    case "search":
      if (!query) return { error: "search requires a query." };
      return { action, query };
  }
}
