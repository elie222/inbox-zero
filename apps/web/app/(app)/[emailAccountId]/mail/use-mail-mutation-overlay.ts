"use client";

import { useEffect, useMemo, useState } from "react";
import { createMailMutationOverlay } from "@/utils/email-cache/mail-mutation-overlay";
import {
  getActiveMailMutations,
  type MailMutation,
  subscribeToMailMutations,
} from "@/utils/email-cache/mail-mutations";
import type { ParsedMessage } from "@/utils/types";

type MutationSnapshot = {
  identity: string;
  mutations: MailMutation[];
};

type OverlayMessage = Pick<ParsedMessage, "id" | "labelIds">;

export function useMailMutationOverlay({
  emailAccountIds,
  enabled,
}: {
  emailAccountIds: string[];
  enabled: boolean;
}) {
  const accountIdentity = useMemo(
    () => [...new Set(emailAccountIds)].sort().join("\u0000"),
    [emailAccountIds],
  );
  const identity = enabled ? accountIdentity || "*" : "disabled";
  const [snapshot, setSnapshot] = useState<MutationSnapshot>();

  useEffect(() => {
    if (!enabled) {
      setSnapshot({ identity, mutations: [] });
      return;
    }

    let cancelled = false;
    let generation = 0;
    const accountIds = new Set(accountIdentity.split("\u0000").filter(Boolean));
    const scopedAccountId =
      accountIds.size === 1 ? accountIds.values().next().value : undefined;
    const load = () => {
      const currentGeneration = ++generation;
      getActiveMailMutations(scopedAccountId)
        .then((mutations) => {
          if (cancelled || currentGeneration !== generation) return;
          setSnapshot({
            identity,
            mutations: accountIds.size
              ? mutations.filter((mutation) =>
                  accountIds.has(mutation.emailAccountId),
                )
              : mutations,
          });
        })
        .catch(() => {
          if (cancelled || currentGeneration !== generation) return;
          setSnapshot({ identity, mutations: [] });
        });
    };
    const unsubscribe = subscribeToMailMutations(load);
    load();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [accountIdentity, enabled, identity]);

  return {
    isReady: !enabled || snapshot?.identity === identity,
    mutations: snapshot?.identity === identity ? snapshot.mutations : [],
  };
}

export function applyMailMutationOverlayToThreads<
  Thread extends { id: string; messages?: OverlayMessage[] },
>({
  getEmailAccountId,
  mutations,
  threads,
}: {
  getEmailAccountId: (thread: Thread) => string;
  mutations: MailMutation[];
  threads: Thread[];
}): Thread[] {
  const overlay = createMailMutationOverlay(mutations);
  const overlaidThreads: Thread[] = [];
  for (const thread of threads) {
    const emailAccountId = getEmailAccountId(thread);
    const currentMessages = thread.messages ?? [];
    if (
      overlay.isThreadHidden(
        emailAccountId,
        thread.id,
        currentMessages.map((message) => message.id),
      )
    ) {
      continue;
    }

    const messages = overlay.applyToMessages(
      emailAccountId,
      currentMessages as ParsedMessage[],
    ) as NonNullable<Thread["messages"]>;
    overlaidThreads.push(
      messages.length === currentMessages.length &&
        messages.every((message, index) => message === currentMessages[index])
        ? thread
        : { ...thread, messages },
    );
  }
  return overlaidThreads;
}
