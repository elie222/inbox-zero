const QUOTED_CONTENT_SELECTOR = [
  ".gmail_quote_container",
  "div.gmail_quote",
  "blockquote.gmail_quote",
  '[id="divRplyFwdMsg"]',
  '[id="x_divRplyFwdMsg"]',
  '[id="appendonsend"]',
  ".yahoo_quoted",
  ".moz-cite-prefix",
  'blockquote[type="cite"]',
].join(", ");

export function splitEmailContent(html: string): {
  mainContent: string;
  hasQuotedContent: boolean;
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const quoteBoundary = doc.querySelector(QUOTED_CONTENT_SELECTOR);

  if (!quoteBoundary) {
    return { mainContent: html, hasQuotedContent: false };
  }

  removeBoundaryAndFollowingContent(quoteBoundary, doc.body);

  return {
    mainContent: doc.body.innerHTML,
    hasQuotedContent: true,
  };
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
