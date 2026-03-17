export function stripQuotedContent(text: string): string {
  const quoteHeaderPatterns = [
    /\n\nOn .* wrote:/,
    /\n\n----+ Original Message ----+/,
    /\n\n>+ On .*/,
    /\n\nFrom: .*/,
  ];

  let result = text;
  for (const pattern of quoteHeaderPatterns) {
    const parts = result.split(pattern);
    if (parts.length > 1) {
      result = parts[0];
      break;
    }
  }

  return result.trim();
}
