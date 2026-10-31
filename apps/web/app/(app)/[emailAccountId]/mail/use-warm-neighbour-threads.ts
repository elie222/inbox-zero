import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type { QueryHandle } from "@inboxzero/mail-core/queries";
import type { ConversationView } from "@inboxzero/mail-core/ports/mail-store";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import {
  getListThreadKey,
  getListThreadSelection,
  getThreadSelectionKey,
  type ListThread,
  type ThreadSelection,
} from "@/app/(app)/[emailAccountId]/mail/types";
import {
  CONVERSATION_PAGE_SIZE,
  requestMissingMessageContent,
} from "@/utils/mail-engine/conversation-thread";
import { prepareEmailHtml } from "@/utils/email/prepare-html.client";

type WarmObservation = {
  handle: QueryHandle<ConversationView>;
  unsubscribe: () => void;
};

type WarmTarget = { key: string; selection: ThreadSelection };

// Keeps the conversations around the active one observed so J/K, Enter or a
// click lands on an engine query that already has its snapshot and bodies.
// The active one is held too: the reader follows a deferred selection and
// subscribes after this effect runs, so releasing it here would drop the data
// it is about to read. Returns a callback that warms one more thread, such as
// the row under the pointer.
export function useWarmNeighbourThreads({
  threads,
  activeThreadKey,
  emailAccountId,
}: {
  threads: ListThread[];
  /** The open thread, or the focused row while no thread is open. */
  activeThreadKey: string | null;
  emailAccountId: string;
}) {
  const client = useOptionalMailClient();
  const warm = useRef<{
    client: MailClient | null;
    observations: Map<string, WarmObservation>;
    hovered: (WarmObservation & { key: string }) | null;
  }>({ client: null, observations: new Map(), hovered: null });
  const targets = useMemo(
    () => getWarmTargets(threads, activeThreadKey, emailAccountId),
    [threads, activeThreadKey, emailAccountId],
  );

  useEffect(() => {
    // Observations belong to the engine that created them.
    if (warm.current.client !== client) {
      releaseAll(warm.current.observations);
      releaseHovered(warm.current);
      warm.current.client = client;
    }
    // The open thread briefly leaves the list while an archive advances the
    // reader; keeping what is held lets the next thread open warm.
    if (!client || !targets) return;
    const { observations } = warm.current;
    const keys = new Set(targets.map((target) => target.key));
    for (const [key, observation] of observations) {
      if (keys.has(key)) continue;
      release(observation);
      observations.delete(key);
    }
    for (const target of targets) {
      if (observations.has(target.key)) continue;
      observations.set(target.key, observe(client, target));
    }
  }, [client, targets]);

  useEffect(() => {
    const held = warm.current;
    return () => {
      releaseAll(held.observations);
      releaseHovered(held);
    };
  }, []);

  return useCallback(
    (thread: ListThread) => {
      const held = warm.current;
      if (!client || held.client !== client) return;
      const selection = getListThreadSelection(thread, emailAccountId);
      const key = getThreadSelectionKey(selection) ?? getListThreadKey(thread);
      if (held.hovered?.key === key || held.observations.has(key)) return;
      releaseHovered(held);
      held.hovered = { key, ...observe(client, { key, selection }) };
    },
    [client, emailAccountId],
  );
}

function observe(client: MailClient, target: WarmTarget): WarmObservation {
  const handle = client.observeConversation(
    {
      accountId: target.selection.emailAccountId,
      conversationId: target.selection.threadId,
    },
    { after: null, pageSize: CONVERSATION_PAGE_SIZE },
  );
  const requested = new Set<string>();
  let preparedSource: { messageId: string; html: string } | null = null;
  const warmContent = () => {
    const view = handle.getSnapshot().data;
    if (!view) return;
    requestMissingMessageContent(client, view, requested);
    // The newest body opens expanded. Preparing its proxy URLs here keeps
    // that request off the navigation path without preparing the whole history.
    const message = view.messages.at(-1);
    if (message?.content.status !== "available" || !message.content.html)
      return;
    const source = {
      messageId: message.key.messageId,
      html: message.content.html,
    };
    if (
      source.messageId === preparedSource?.messageId &&
      source.html === preparedSource.html
    )
      return;
    preparedSource = source;
    prepareEmailHtml(source);
  };
  const unsubscribe = handle.subscribe(warmContent);
  warmContent();
  return { handle, unsubscribe };
}

// Returns null when the active thread isn't in the list, meaning "keep what is
// held"; an empty list means there is nothing to warm.
function getWarmTargets(
  threads: ListThread[],
  activeThreadKey: string | null,
  emailAccountId: string,
): WarmTarget[] | null {
  if (!activeThreadKey) return [];
  const index = threads.findIndex(
    (thread) => getListThreadKey(thread) === activeThreadKey,
  );
  if (index === -1) return null;
  return [threads[index - 1], threads[index], threads[index + 1]]
    .filter((thread): thread is ListThread => Boolean(thread))
    .map((thread) => {
      const selection = getListThreadSelection(thread, emailAccountId);
      return {
        key: getThreadSelectionKey(selection) ?? getListThreadKey(thread),
        selection,
      };
    });
}

function release(observation: WarmObservation) {
  observation.unsubscribe();
  observation.handle.close();
}

function releaseAll(observations: Map<string, WarmObservation>) {
  for (const observation of observations.values()) release(observation);
  observations.clear();
}

function releaseHovered(held: { hovered: WarmObservation | null }) {
  if (!held.hovered) return;
  release(held.hovered);
  held.hovered = null;
}
