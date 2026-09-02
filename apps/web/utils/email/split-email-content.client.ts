const QUOTED_CONTENT_SELECTOR = [
  ".gmail_quote_container",
  "div.gmail_quote",
  "blockquote.gmail_quote",
  'div[id$="divRplyFwdMsg"]',
  'div[id$="appendonsend"]',
  ".yahoo_quoted",
  ".moz-cite-prefix",
  'blockquote[type="cite"]',
].join(", ");

export function splitEmailContent(html: string): {
  mainContent: string;
  hasQuotedContent: boolean;
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const quoteBoundary = findQuoteBoundary(doc);

  if (!quoteBoundary) {
    return { mainContent: html, hasQuotedContent: false };
  }

  removeBoundaryAndFollowingContent(quoteBoundary, doc.body);

  return {
    mainContent: doc.body.innerHTML,
    hasQuotedContent: true,
  };
}

function findQuoteBoundary(doc: Document) {
  return Array.from(
    doc.querySelectorAll(`${QUOTED_CONTENT_SELECTOR}, div[style]`),
  ).find(
    (element) =>
      element.matches(QUOTED_CONTENT_SELECTOR) ||
      isOutlookDesktopReplyHeader(element),
  );
}

function isOutlookDesktopReplyHeader(element: Element) {
  if (element.tagName !== "DIV" || !element.closest(".WordSection1")) {
    return false;
  }

  const style = (element as HTMLElement).style;
  const borderColor = style.borderTopColor.replaceAll(" ", "").toLowerCase();
  const hasOutlookDividerStyle =
    style.borderTopStyle === "solid" &&
    style.borderTopWidth === "1pt" &&
    ["#e1e1e1", "rgb(225,225,225)"].includes(borderColor) &&
    style.paddingTop === "3pt";

  if (!hasOutlookDividerStyle) return false;

  const header = element.querySelector("p.MsoNormal");
  if (!header) return false;

  return (
    header.querySelectorAll("b").length >= 2 &&
    Boolean(header.querySelector("br"))
  );
}

function removeBoundaryAndFollowingContent(
  boundary: Element,
  body: HTMLElement,
) {
  let current: Node = boundary;

  while (current !== body) {
    while (current.nextSibling) {
      current.parentNode?.removeChild(current.nextSibling);
    }

    const parent = current.parentNode;
    if (!parent) break;

    if (current === boundary) parent.removeChild(current);
    current = parent;
  }
}
