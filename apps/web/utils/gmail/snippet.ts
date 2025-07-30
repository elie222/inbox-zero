// NOTE: this only works for English. May want to support other languages in the future.
export function snippetRemoveReply(snippet?: string | null): string {
  if (!snippet) return "";
  try {
    const regex = /On (Mon|Tue|Wed|Thu|Fri|Sat|Sun),/;
    const match = snippet.split(regex)[0];
    return match.trim();
  } catch {
    return snippet;
  }
}
