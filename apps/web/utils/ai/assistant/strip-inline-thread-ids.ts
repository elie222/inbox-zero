const ID_LABEL = "(?:thread\\s*id|threadid|thread|message\\s*id|messageid)";
// 12+ alnum chars avoids matching short words like "thread 5"; real Gmail IDs
// are 16 hex chars and Outlook IDs are much longer.
const ID_VALUE = "[A-Za-z0-9_=+/-]{12,}";

const PARENTHESIZED = new RegExp(
  `\\s*\\(\\s*${ID_LABEL}\\s*:?\\s*${ID_VALUE}\\s*\\)`,
  "gi",
);

const INLINE = new RegExp(`\\s*\\b${ID_LABEL}\\s*:?\\s+${ID_VALUE}\\b`, "gi");

export function stripInlineThreadIds(text: string): string {
  return text
    .replace(PARENTHESIZED, "")
    .replace(INLINE, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}
