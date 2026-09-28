"use client";

import { useEffect, useMemo, useState } from "react";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import type { MailPredicate } from "@inboxzero/mail-core/queries";
import { labelNamesToAccountScopedPredicate } from "@/app/(app)/[emailAccountId]/mail/use-combined-mail-threads";
import type { EmailLabels } from "@/providers/email-label-types";
import { splitCountTargets } from "@/utils/mail/split-counts";
import type { MailSplit, PortableLabelSplit } from "@/utils/mail/split-query";

const EMPTY_COUNTS = new Map<string, number>();

export function useSplitCounts({
  accountIds,
  splits,
  enabled,
  portableLabelSplits,
  labelsByAccount,
}: {
  accountIds: string[];
  splits: MailSplit[];
  enabled: boolean;
  portableLabelSplits?: PortableLabelSplit[];
  labelsByAccount?: Record<string, EmailLabels>;
}) {
  const client = useOptionalMailClient();
  const accountKey = accountIds.join("\0");
  const stableAccountIds = useMemo(
    () => (accountKey ? accountKey.split("\0") : []),
    [accountKey],
  );
  const overrides = useMemo(
    () =>
      portableLabelSplits
        ? portableSplitCountOverrides({
            portableLabelSplits,
            accountIds: stableAccountIds,
            labelsByAccount,
          })
        : undefined,
    [labelsByAccount, portableLabelSplits, stableAccountIds],
  );
  const targets = useMemo(
    () => splitCountTargets({ splits, overrides }),
    [overrides, splits],
  );
  const [countsById, setCountsById] = useState(EMPTY_COUNTS);

  useEffect(() => {
    if (
      !client ||
      !enabled ||
      stableAccountIds.length === 0 ||
      targets.length === 0
    ) {
      setCountsById((current) => (current.size === 0 ? current : EMPTY_COUNTS));
      return;
    }

    const handle = client.observeMailboxCounts({
      accountIds: stableAccountIds,
      targets,
    });
    const apply = () => {
      const next = new Map<string, number>();
      for (const count of handle.getSnapshot().data?.counts ?? []) {
        next.set(count.id, count.matchingConversations);
      }
      setCountsById((current) => (sameCounts(current, next) ? current : next));
    };
    const unsubscribe = handle.subscribe(apply);
    apply();
    return () => {
      unsubscribe();
      handle.close();
    };
  }, [client, enabled, stableAccountIds, targets]);

  return countsById;
}

function portableSplitCountOverrides({
  portableLabelSplits,
  accountIds,
  labelsByAccount,
}: {
  portableLabelSplits: PortableLabelSplit[];
  accountIds: string[];
  labelsByAccount?: Record<string, EmailLabels>;
}) {
  const labelsReady = Object.keys(labelsByAccount ?? {}).length > 0;
  const overrides = new Map<string, MailPredicate | null>();
  for (const split of portableLabelSplits) {
    overrides.set(
      split.id,
      labelsReady && labelsByAccount
        ? labelNamesToAccountScopedPredicate({
            accountIds,
            labelsByAccount,
            labelNames: split.labelNames,
          })
        : null,
    );
  }
  return overrides;
}

function sameCounts(left: Map<string, number>, right: Map<string, number>) {
  if (left.size !== right.size) return false;
  for (const [id, count] of right) {
    if (left.get(id) !== count) return false;
  }
  return true;
}
