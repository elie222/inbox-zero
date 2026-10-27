"use client";

import { useMemo } from "react";
import type { MailPredicate } from "@inboxzero/mail-core/queries";
import useSWR from "swr";
import { useSWRConfig } from "swr";
import { useEngineMailThreads } from "@/app/(app)/[emailAccountId]/mail/use-engine-mail-threads";
import type { LabelsResponse } from "@/app/api/labels/route";
import type { EmailLabels } from "@/providers/email-label-types";
import type { CombinedListThread } from "@/utils/threads/load-combined";
import type { ThreadsQuery } from "@/utils/threads/validation";
import {
  splitSelectionPredicate,
  type SplitSelection,
} from "@/utils/split-inbox/split-selection";
import {
  type MailSplit,
  type PortableLabelSplit,
  mailSplitToThreadsQuery,
} from "@/utils/split-inbox/split-query";
import { threadsQueryToPredicate } from "@/utils/mail-engine/threads-query";

const EMPTY_LABELS_BY_ACCOUNT: Record<string, EmailLabels> = {};
const MAX_MAIL_PREDICATE_CHILDREN = 32;

export function useCombinedMailThreads({
  accounts,
  emailAccountId,
  enabled,
  isUnread,
  labelNames,
  searchQuery,
  splitSelection,
  splits = [],
  portableLabelSplits = [],
}: {
  accounts: CombinedListThread["account"][];
  emailAccountId: string;
  enabled: boolean;
  isUnread: boolean;
  labelNames?: string[];
  searchQuery?: string;
  splitSelection?: SplitSelection;
  splits?: MailSplit[];
  portableLabelSplits?: PortableLabelSplit[];
}) {
  const accountIds = useMemo(
    () => accounts.map((account) => account.id),
    [accounts],
  );
  const accountsById = useMemo(
    () => Object.fromEntries(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const labelsByAccount = useLabelsByAccount(enabled ? accountIds : []);
  const predicate = useMemo(
    () =>
      splitSelection
        ? splitSelectionPredicate(splitSelection, splits, (split) => {
            const portable = portableLabelSplits.find(
              (item) => item.id === split.id,
            );
            return portable
              ? labelNamesToAccountScopedPredicate({
                  accountIds,
                  labelsByAccount,
                  labelNames: portable.labelNames,
                })
              : threadsQueryToPredicate(mailSplitToThreadsQuery(split));
          })
        : labelNames?.length
          ? labelNamesToAccountScopedPredicate({
              accountIds,
              labelsByAccount,
              labelNames,
            })
          : undefined,
    [
      accountIds,
      labelNames,
      labelsByAccount,
      splitSelection,
      splits,
      portableLabelSplits,
    ],
  );
  const query = useMemo<ThreadsQuery>(() => {
    if (searchQuery) return { q: searchQuery };
    if (labelNames?.length) {
      return { type: "inbox" };
    }
    if (isUnread) return { type: "unread" };
    return { type: "inbox" };
  }, [isUnread, labelNames, searchQuery]);
  const waitingForLabels = Boolean(
    splitSelection &&
      portableLabelSplits.some((split) =>
        splitSelection.ids.includes(split.id),
      ) &&
      !Object.keys(labelsByAccount).length,
  );
  const state = useEngineMailThreads({
    emailAccountId,
    accountIds: accountIds.length ? accountIds : [emailAccountId],
    accounts: accountsById,
    query,
    predicate: searchQuery ? undefined : predicate,
    enabled: enabled && !waitingForLabels,
  });
  return {
    ...state,
    isLoading: state.isLoading || (enabled && waitingForLabels),
    labelsByAccount,
  };
}

function useLabelsByAccount(accountIds: string[]): Record<string, EmailLabels> {
  const { fetcher } = useSWRConfig();
  const accountKey = useMemo(
    () => [...accountIds].sort().join(":"),
    [accountIds],
  );
  const { data } = useSWR(
    fetcher && accountIds.length
      ? ["mail-labels-by-account", accountKey]
      : null,
    async () => {
      if (!fetcher) return {};
      const entries = await Promise.all(
        accountIds.map(async (accountId) => {
          const response = (await fetcher(["/api/labels", accountId])) as
            | LabelsResponse
            | undefined;
          return [accountId, labelsResponseToMap(response)] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
    { revalidateOnFocus: false },
  );
  return data ?? EMPTY_LABELS_BY_ACCOUNT;
}

function labelsResponseToMap(
  response: LabelsResponse | undefined,
): EmailLabels {
  if (!response?.labels) return {};
  return Object.fromEntries(
    response.labels
      .filter((label) => label.type === "user")
      .map((label) => [
        label.id || "",
        {
          id: label.id || "",
          name: label.name || "",
          type: label.type || null,
          color: label.color,
          labelListVisibility: label.labelListVisibility,
          messageListVisibility: label.messageListVisibility,
        },
      ]),
  );
}

export function labelNamesToAccountScopedPredicate({
  accountIds,
  labelsByAccount,
  labelNames,
}: {
  accountIds: string[];
  labelsByAccount: Record<string, EmailLabels>;
  labelNames: string[];
}): MailPredicate {
  const wantedNames = new Set(labelNames.map((name) => name.trim()));
  const predicates: MailPredicate[] = [];
  const seen = new Set<string>();

  for (const accountId of accountIds) {
    for (const label of Object.values(labelsByAccount[accountId] ?? {})) {
      if (!label.id || !wantedNames.has(label.name.trim())) continue;
      const key = JSON.stringify([accountId, label.id]);
      if (seen.has(key)) continue;
      seen.add(key);
      predicates.push({
        kind: "membership",
        membership: "label",
        id: label.id,
        accountId,
      });
    }
  }

  return {
    kind: "all",
    predicates: [{ kind: "role", role: "inbox" }, anyPredicate(predicates)],
  };
}

function anyPredicate(predicates: MailPredicate[]): MailPredicate {
  if (predicates.length <= MAX_MAIL_PREDICATE_CHILDREN) {
    return { kind: "any", predicates };
  }
  const chunks: MailPredicate[] = [];
  for (
    let index = 0;
    index < predicates.length;
    index += MAX_MAIL_PREDICATE_CHILDREN
  ) {
    chunks.push({
      kind: "any",
      predicates: predicates.slice(index, index + MAX_MAIL_PREDICATE_CHILDREN),
    });
  }
  return { kind: "any", predicates: chunks };
}
