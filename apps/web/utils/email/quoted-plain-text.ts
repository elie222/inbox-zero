export function buildQuotedPlainText({
  textContent,
  quotedHeader,
  quotedContent,
}: {
  textContent?: string;
  quotedHeader: string;
  quotedContent?: string;
}) {
  return `${textContent || ""}\n\n${quotedHeader}\n\n${quotedContent || ""}`.trim();
}

export function quotePlainTextContent(content?: string) {
  return content
    ?.split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}
