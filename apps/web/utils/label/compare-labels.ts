type SortableLabel = {
  id?: string | null;
  name?: string | null;
};

const LABEL_SORT_LOCALE = "en";

export function compareLabelsByName(a: SortableLabel, b: SortableLabel) {
  const aName = a.name || "";
  const bName = b.name || "";

  if (aName.startsWith("[") && !bName.startsWith("[")) return 1;
  if (!aName.startsWith("[") && bName.startsWith("[")) return -1;

  return (
    aName.localeCompare(bName, LABEL_SORT_LOCALE) ||
    (a.id || "").localeCompare(b.id || "", LABEL_SORT_LOCALE)
  );
}
