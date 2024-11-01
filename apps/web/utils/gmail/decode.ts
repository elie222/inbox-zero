import he from "he";

export function decodeSnippet(snippet?: string | null) {
  if (!snippet) return "";
  return he.decode(snippet).replace(/\u200C|\u200D|\uFEFF/g, "");
}
