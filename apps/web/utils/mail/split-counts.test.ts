import { describe, expect, it } from "vitest";
import type { MailPredicate } from "@inboxzero/mail-core/queries";
import { MailSplitFilterKind } from "@/generated/prisma/enums";
import { threadsQueryToPredicate } from "@/utils/mail-engine/threads-query";
import { splitCountTargets } from "@/utils/mail/split-counts";
import {
  OTHER_SPLIT_ID,
  mailSplitToThreadsQuery,
  otherMailSplitQuery,
  type MailSplit,
} from "@/utils/mail/split-query";

const NOW = new Date("2026-09-09T12:00:00.000Z");

function split(
  id: string,
  filters: { kind: MailSplitFilterKind; value?: string | null }[],
): MailSplit {
  return {
    id,
    name: id,
    matchAll: true,
    filters: filters.map((filter) => ({
      kind: filter.kind,
      value: filter.value ?? null,
    })),
  };
}

describe("splitCountTargets", () => {
  it("counts each split with the same predicate the list uses", () => {
    const splits = [
      split("all", []),
      split("unread", [{ kind: MailSplitFilterKind.UNREAD }]),
      split("old", [{ kind: MailSplitFilterKind.OLDER_THAN, value: "1w" }]),
      split(OTHER_SPLIT_ID, []),
    ];

    expect(splitCountTargets({ splits, now: NOW })).toEqual(
      splits.map((item) => ({
        id: item.id,
        predicate: threadsQueryToPredicate(
          item.id === OTHER_SPLIT_ID
            ? otherMailSplitQuery(splits)
            : mailSplitToThreadsQuery(item, NOW),
        ),
      })),
    );
  });

  it("uses a ready override and skips splits that cannot be counted yet", () => {
    const predicate: MailPredicate = { kind: "role", role: "inbox" };
    const splits = [
      split("all", []),
      split("bad", [{ kind: MailSplitFilterKind.FROM }]),
      split("pending", [
        { kind: MailSplitFilterKind.LABEL, value: "label-id" },
      ]),
    ];

    expect(
      splitCountTargets({
        splits,
        now: NOW,
        overrides: new Map<string, MailPredicate | null>([
          ["all", predicate],
          ["pending", null],
        ]),
      }),
    ).toEqual([{ id: "all", predicate }]);
  });
});
