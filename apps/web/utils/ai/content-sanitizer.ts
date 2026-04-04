export function stripHiddenText(text: string): string {
  let result = text.replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/g, "");
  result = result.replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
  return result;
}

export function stripHiddenHtml(html: string): string {
  let result = stripHiddenText(html);
  result = result.replace(/<!--[\s\S]*?-->/g, "");
  result = result.replace(
    /<[^>]+style\s*=\s*"[^"]*display\s*:\s*none[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi,
    "",
  );
  result = result.replace(
    /<[^>]+style\s*=\s*"[^"]*visibility\s*:\s*hidden[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi,
    "",
  );
  result = result.replace(
    /<[^>]+style\s*=\s*"[^"]*font-size\s*:\s*0(?:px|em|%)?[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi,
    "",
  );
  return result;
}

export function sanitizeForAI(input: {
  textPlain?: string;
  textHtml?: string;
}): { textPlain?: string; textHtml?: string } {
  return {
    textPlain: input.textPlain
      ? stripHiddenText(input.textPlain)
      : input.textPlain,
    textHtml: input.textHtml ? stripHiddenHtml(input.textHtml) : input.textHtml,
  };
}
