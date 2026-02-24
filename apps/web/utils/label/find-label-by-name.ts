export function findLabelByName<T>({
  labels,
  name,
  getLabelName,
  normalize,
}: {
  labels: T[] | null | undefined;
  name: string;
  getLabelName: (label: T) => string | null | undefined;
  normalize: (value: string) => string;
}) {
  const normalizedSearch = normalize(name);
  return labels?.find((label) => {
    const labelName = getLabelName(label);
    return labelName && normalize(labelName) === normalizedSearch;
  });
}
