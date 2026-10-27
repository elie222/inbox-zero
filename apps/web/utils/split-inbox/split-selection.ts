import type { MailPredicate } from "@inboxzero/mail-core/queries";
import { threadsQueryToPredicate } from "@/utils/mail-engine/threads-query";
import {
  type MailSplit,
  OTHER_SPLIT_ID,
  mailSplitToThreadsQuery,
  otherMailSplitQuery,
} from "./split-query";

export type SplitSelection = { mode: "include" | "exclude"; ids: string[] };

export function readSplitSelection(
  value: string | null,
  splits: MailSplit[],
): SplitSelection {
  const ids = new Set(selectableSplits(splits).map((split) => split.id));
  if (
    !value ||
    value === "all" ||
    splits.some((split) => split.id === value && isAllSplit(split))
  )
    return { mode: "exclude", ids: [] };
  if (value === "none") return { mode: "include", ids: [] };
  if (ids.has(value)) return { mode: "include", ids: [value] };
  try {
    const parsed = JSON.parse(value);
    if (
      (parsed.mode === "include" || parsed.mode === "exclude") &&
      Array.isArray(parsed.ids) &&
      parsed.ids.length <= 32 &&
      parsed.ids.every((id: unknown) => typeof id === "string")
    ) {
      return {
        mode: parsed.mode,
        ids: [...new Set<string>(parsed.ids)].filter((id) => ids.has(id)),
      };
    }
  } catch {}
  return { mode: "exclude", ids: [] };
}

export function selectedSplitIds(
  selection: SplitSelection,
  splits: MailSplit[],
) {
  const selected = new Set(
    selectableSplits(splits)
      .filter((split) =>
        selection.mode === "exclude"
          ? !selection.ids.includes(split.id)
          : selection.ids.includes(split.id),
      )
      .map((split) => split.id),
  );
  if (selection.mode === "exclude" && !selection.ids.length)
    for (const split of splits.filter(isAllSplit)) selected.add(split.id);
  return selected;
}

export function toggleSplitSelection(
  value: string | null,
  id: string,
  splits: MailSplit[],
): string {
  const selection = readSplitSelection(value, splits);
  if (
    id === "all" ||
    splits.some((split) => split.id === id && isAllSplit(split))
  )
    return selection.mode === "exclude" && !selection.ids.length
      ? "none"
      : "all";
  const available = selectableSplits(splits).map((split) => split.id);
  if (!available.includes(id)) return value ?? "all";
  const selected = new Set(
    [...selectedSplitIds(selection, splits)].filter((id) =>
      available.includes(id),
    ),
  );
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  if (!selected.size) return "none";
  if (selected.size === available.length) return "all";
  const ids =
    selection.mode === "exclude"
      ? available.filter((id) => !selected.has(id))
      : available.filter((id) => selected.has(id));
  if (selection.mode === "include" && ids.length === 1) return ids[0];
  return JSON.stringify({ mode: selection.mode, ids: ids.sort() });
}

export function splitSelectionPredicate(
  selection: SplitSelection,
  splits: MailSplit[],
  resolve?: (split: MailSplit) => MailPredicate,
): MailPredicate {
  const predicates = selectableSplits(splits)
    .filter((split) => selection.ids.includes(split.id))
    .map((split) =>
      resolve
        ? resolve(split)
        : threadsQueryToPredicate(
            split.id === OTHER_SPLIT_ID
              ? otherMailSplitQuery(splits)
              : mailSplitToThreadsQuery(split),
          ),
    );
  if (selection.mode === "exclude" && !predicates.length)
    return { kind: "role", role: "inbox" };
  const any: MailPredicate = { kind: "any", predicates };
  return {
    kind: "all",
    predicates: [
      { kind: "role", role: "inbox" },
      selection.mode === "exclude" ? { kind: "not", predicate: any } : any,
    ],
  };
}

function isAllSplit(split: MailSplit) {
  return !split.filters.length && split.id !== OTHER_SPLIT_ID;
}
function selectableSplits(splits: MailSplit[]) {
  return splits.filter((split) => !isAllSplit(split));
}
