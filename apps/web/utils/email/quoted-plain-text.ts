export function buildQuotedPlainText({
  textContent,
  quotedHeader,
  quotedContent,
}: {
  textContent?: string;
  quotedHeader: string;
  quotedContent?: string;
}) {
  const parts = [textContent, quotedHeader, quotedContent].filter(
    (part): part is string => part !== undefined && part !== "",
  );

  return parts.join("\n\n");
}

export function quotePlainTextContent(content?: string) {
  if (!content) return undefined;

  return content
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}
