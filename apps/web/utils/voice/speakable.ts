const ENDS_SENTENCE = /[.!?:;]\s*$/;
const BOUNDARY =
  /(?<!\b(?:e\.g|i\.e|etc|vs|Dr|Mr|Mrs|Ms|No|approx))(?<![.\d])([.!?])(["')\]]*)\s+/g;

/**
 * Markdown (or assistant output) → a line a voice can read.
 * Say the prose, name the artifacts, drop the syntax.
 */
export function speakable(input: string): string {
  if (!input) return "";
  let text = input;

  text = text.replace(
    /```([^\n]*)\n[\s\S]*?(?:```|$)/g,
    (_match, fence: string) => describeCodeBlock(fence),
  );
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match, alt: string) =>
    alt ? `. (image: ${alt}) ` : ". (an image) ",
  );
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/<https?:\/\/[^>\s]+>/g, " a link ");
  text = text.replace(/\bhttps?:\/\/\S+/g, " a link ");
  text = text.replace(/`([^`\n]+)`/g, (_match, code: string) =>
    code.length <= 40 ? code : " that snippet ",
  );
  text = text.replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, (_match, head: string) =>
    ENDS_SENTENCE.test(head) ? head : `${head.trim()}.`,
  );
  text = text.replace(/^\s*[-*+]\s+/gm, "");
  text = text.replace(/^\s*\d+[.)]\s+/gm, "");
  text = text.replace(/^\s*>\s?/gm, "");
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(?=\S)(.*?)(?<=\S)\1/g, "$2");
  text = text.replace(
    /[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]/gu,
    "",
  );
  text = text.replace(/\n{2,}/g, ". ");
  text = text.replace(/\n/g, ". ");
  text = text.replace(/\s+/g, " ");
  text = text.replace(/\s+([.,!?;:])/g, "$1");
  text = text.replace(/(?:\.\s*){2,}/g, ". ");
  text = text.trim();

  return /[\p{L}\p{N}]/u.test(text) ? text : "";
}

export function toUtterances(
  input: string,
  { minChars = 12, maxChars = 320 } = {},
): string[] {
  const text = speakable(input);
  if (!text) return [];

  const mark = "\u0000";
  const rough = text
    .replace(BOUNDARY, `$1$2${mark}`)
    .split(mark)
    .map((part) => part.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const piece of rough) {
    const parts =
      piece.length <= maxChars ? [piece] : splitLong(piece, maxChars);
    for (const part of parts) {
      const prev = out[out.length - 1];
      if (prev && (prev.length < minChars || part.length < minChars)) {
        const merged = `${prev} ${part}`;
        if (merged.length <= maxChars) {
          out[out.length - 1] = merged;
          continue;
        }
      }
      out.push(part);
    }
  }
  return out;
}

function describeCodeBlock(fence: string): string {
  const lang =
    fence
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^a-z0-9+#]/gi, "") ?? "";
  const spoken: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    js: "JavaScript",
    json: "JSON",
    py: "Python",
    sh: "shell",
    bash: "shell",
  };
  const name = spoken[lang.toLowerCase()];
  return name ? `. (a ${name} code block) ` : ". (a code block) ";
}

function splitLong(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const at = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "));
    const space = window.lastIndexOf(" ");
    let cut = maxChars;
    if (at > maxChars / 2) cut = at + 1;
    else if (space > 0) cut = space;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}
