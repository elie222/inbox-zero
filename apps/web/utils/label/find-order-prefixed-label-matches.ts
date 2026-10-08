// Users often number labels to control Gmail's sort order ("1: To Reply",
// "7. OG", "04 Archives"). Asking for the unnumbered name should reuse them.
const ORDER_PREFIX = /^\d{1,3}\s*[:)]?\s+/;

export function findOrderPrefixedLabelMatches<T>({
  labels,
  name,
  getLabelName,
  normalize,
}: {
  labels: T[];
  name: string;
  getLabelName: (label: T) => string;
  normalize: (value: string) => string;
}) {
  const normalizedSearch = normalize(name);
  if (!normalizedSearch) return [];

  return labels.filter((label) => {
    const normalizedLabel = normalize(getLabelName(label));
    return (
      normalizedLabel !== normalizedSearch &&
      normalizedLabel.replace(ORDER_PREFIX, "") === normalizedSearch
    );
  });
}
