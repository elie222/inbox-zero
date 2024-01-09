import he from "he";

export function decodeSnippet(snippet?: string | null) {
  if (!snippet) return "";
  return he.decode(snippet);
}
