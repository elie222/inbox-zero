export function stripInlineEmailSections(text: string) {
  return text.replace(/<emails\b[^>]*>[\s\S]*?<\/emails>/gi, "").trim();
}
