import { useEffect, useRef } from "react";
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

// Holds engine observations for the conversations around the open one so J/K
// lands on a group that already has a snapshot and body content, instead of
// waiting on a fresh read and a body fetch. The open conversation is held too:
// the reader follows a deferred selection, and releasing the newly opened
// thread before the reader subscribes would drop its warm group.
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
  const warm = useRef(new Map<string, WarmObservation>());
  const targetsJson = JSON.stringify(
    getWarmTargets(threads, openThreadKey, emailAccountId),
  );

  useEffect(() => {
    const observations = warm.current;
    const targets = client
      ? (JSON.parse(targetsJson) as ThreadSelection[])
      : [];
    const keys = new Set(targets.map((target) => targetKey(target)));
    for (const [key, observation] of observations) {
      if (keys.has(key)) continue;
      release(observation);
      observations.delete(key);
    }
    if (!client) return;
    for (const target of targets) {
      const key = targetKey(target);
      if (observations.has(key)) continue;
      const handle = client.observeConversation(
        { accountId: target.emailAccountId, conversationId: target.threadId },
        { after: null, pageSize: CONVERSATION_PAGE_SIZE },
      );
      const requested = new Set<string>();
      const warmContent = () => {
        const view = handle.getSnapshot().data;
        if (view) requestMissingMessageContent(client, view, requested);
      };
      const unsubscribe = handle.subscribe(warmContent);
      warmContent();
      observations.set(key, { handle, unsubscribe });
    }
  }, [client, targetsJson]);

  useEffect(() => {
    const observations = warm.current;
    return () => {
      for (const observation of observations.values()) release(observation);
      observations.clear();
    };
  }, []);
}

function getWarmTargets(
  threads: ListThread[],
  openThreadKey: string | null,
  emailAccountId: string,
): ThreadSelection[] {
  if (!openThreadKey) return [];
  const index = threads.findIndex(
    (thread) => getListThreadKey(thread) === openThreadKey,
  );
  if (index === -1) return [];
  return [threads[index - 1], threads[index], threads[index + 1]]
    .filter((thread): thread is ListThread => Boolean(thread))
    .map((thread) => getListThreadSelection(thread, emailAccountId));
}

function targetKey(target: ThreadSelection) {
  return getThreadSelectionKey(target) ?? "";
}

function release(observation: WarmObservation) {
  observation.unsubscribe();
  observation.handle.close();
}
