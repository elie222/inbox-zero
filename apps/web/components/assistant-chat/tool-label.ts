export function formatToolLabel(toolType: string): string {
  const withoutPrefix = toolType.replace(/^tool-/, "");
  return withoutPrefix
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}
