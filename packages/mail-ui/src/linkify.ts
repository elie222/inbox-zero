import { LinkifyIt, type Match } from "linkify-it";
import tlds from "tlds";
import type { MailPlainTextSegment } from "./MailBody";
import { getSafeEmailLinkUrl } from "./safe-link-url";

const linkify = new LinkifyIt({ fuzzyLink: true }).tlds(tlds).add("ftp:", null);
// The full TLD list includes words like "zip" and "final", so a bare name such
// as "report.final" is only a link when its TLD is a common one.
const commonTldLinkify = new LinkifyIt({ fuzzyLink: true });

// Text in these elements is code, styling, or an existing link, so a URL-like
// string there must stay as written.
const NON_LINKABLE_ANCESTORS =
  "a, button, code, kbd, pre, samp, script, style, textarea, title";

export function linkifyPlainText(text: string): MailPlainTextSegment[] {
  const matches = linkify.match(text);
  if (!matches) return [{ type: "text", text }];

  const segments: MailPlainTextSegment[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    if (isBareHostWithUncommonTld(match)) continue;
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

export function linkifyHtml(root: Element) {
  const document = root.ownerDocument;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const linkableNodes: { node: Text; segments: MailPlainTextSegment[] }[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest(NON_LINKABLE_ANCESTORS)) continue;
    const segments = linkifyPlainText(node.data);
    if (segments.some((segment) => segment.type === "link")) {
      linkableNodes.push({ node, segments });
    }
  }

  for (const { node, segments } of linkableNodes) {
    const fragment = document.createDocumentFragment();
    for (const segment of segments) {
      if (segment.type === "text") {
        fragment.append(segment.text);
        continue;
      }
      const link = document.createElement("a");
      link.href = segment.href;
      link.textContent = segment.text;
      fragment.append(link);
    }
    node.replaceWith(fragment);
  }
}

function isBareHostWithUncommonTld(match: Match) {
  return (
    !match.schema &&
    !/[/?#]./u.test(match.raw) &&
    !commonTldLinkify.test(match.raw)
  );
}
