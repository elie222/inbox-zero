export const SNIPPET_SHORTCUT_MAX_LENGTH = 40;

export function normalizeSnippetShortcut(value: string): string {
  return value.trim().replace(/^\/+/, "").toLowerCase();
}

export function isValidSnippetShortcut(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= SNIPPET_SHORTCUT_MAX_LENGTH &&
    /^[a-z][a-z0-9-]*$/.test(value)
  );
}
