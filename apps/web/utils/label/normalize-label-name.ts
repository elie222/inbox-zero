export function normalizeLabelName(name: string) {
  return name
    .toLowerCase()
    .replace(/[-_.]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\/+|\/+$/g, "")
    .trim();
}
