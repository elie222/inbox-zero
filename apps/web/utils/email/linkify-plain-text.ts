import LinkifyIt from "linkify-it";
import tlds from "tlds";
import { getSafeEmailLinkUrl } from "./safe-email-link-url";

type PlainTextSegment =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string };

const linkify = new LinkifyIt().tlds(tlds).add("ftp:", null);

export function linkifyPlainText(text: string): PlainTextSegment[] {
  const matches = linkify.match(text);
  if (!matches) return [{ type: "text", text }];

  const segments: PlainTextSegment[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    const href = getSafeEmailLinkUrl(match.url);
    if (!href) continue;

    if (match.index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "link", text: match.raw, href });
    lastIndex = match.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: "text", text }];
}
