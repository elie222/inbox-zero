export function findNestedLabelMatches<T>({
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
  const normalizedSearch = normalize(name).trim();
  if (!normalizedSearch || normalizedSearch.includes("/")) return [];

  return labels.filter((label) => {
    const path = normalize(getLabelName(label))
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    return path.length > 1 && path.at(-1) === normalizedSearch;
  });
}
