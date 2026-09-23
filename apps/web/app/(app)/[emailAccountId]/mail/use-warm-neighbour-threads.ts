import { useEffect, useMemo, useRef } from "react";
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

type WarmObservation = {
  handle: QueryHandle<ConversationView>;
  unsubscribe: () => void;
};

type WarmTarget = { key: string; selection: ThreadSelection };

// Keeps the conversations around the open one observed so J/K lands on an
// engine query that already has its snapshot and bodies. The open one is held
// too: the reader follows a deferred selection and subscribes after this
// effect runs, so releasing it here would drop the data it is about to read.
export function useWarmNeighbourThreads({
  threads,
  openThreadKey,
  emailAccountId,
}: {
  threads: ListThread[];
  openThreadKey: string | null;
  emailAccountId: string;
}) {
  const client = useOptionalMailClient();
  const warm = useRef<{
    client: MailClient | null;
    observations: Map<string, WarmObservation>;
  }>({ client: null, observations: new Map() });
  const targets = useMemo(
    () => getWarmTargets(threads, openThreadKey, emailAccountId),
    [threads, openThreadKey, emailAccountId],
  );

  useEffect(() => {
    // Observations belong to the engine that created them.
    if (warm.current.client !== client) {
      releaseAll(warm.current.observations);
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
    return () => releaseAll(held.observations);
  }, []);
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
  const warmContent = () => {
    const view = handle.getSnapshot().data;
    if (view) requestMissingMessageContent(client, view, requested);
  };
  const unsubscribe = handle.subscribe(warmContent);
  warmContent();
  return { handle, unsubscribe };
}

// Returns null when the open thread isn't in the list, meaning "keep what is
// held"; an empty list means nothing is open.
function getWarmTargets(
  threads: ListThread[],
  openThreadKey: string | null,
  emailAccountId: string,
): WarmTarget[] | null {
  if (!openThreadKey) return [];
  const index = threads.findIndex(
    (thread) => getListThreadKey(thread) === openThreadKey,
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
