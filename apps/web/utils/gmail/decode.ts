import he from "he";

export function decodeHtmlEntities(text?: string | null) {
  if (!text) return "";
  return he.decode(text).replace(/\u200C|\u200D|\uFEFF/g, "");
}

export function decodeSnippet(snippet?: string | null) {
  return decodeHtmlEntities(snippet);
}
