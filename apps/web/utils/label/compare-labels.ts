type SortableLabel = {
  id?: string | null;
  name?: string | null;
};

export function compareLabelsByName(a: SortableLabel, b: SortableLabel) {
  const aName = a.name || "";
  const bName = b.name || "";

  if (aName.startsWith("[") && !bName.startsWith("[")) return 1;
  if (!aName.startsWith("[") && bName.startsWith("[")) return -1;

  return aName.localeCompare(bName) || (a.id || "").localeCompare(b.id || "");
}
