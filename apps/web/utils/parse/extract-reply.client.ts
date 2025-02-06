export function extractEmailReply(html: string): {
  latestReply: string;
  originalThread: string;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Find the first gmail_quote container
  const quoteContainer = doc.querySelector(
    ".gmail_quote_container, .gmail_quote",
  );

  if (quoteContainer) {
    // Try to get nested reply first (case 1)
    let firstDiv = doc.querySelector('div[dir="ltr"] > div[dir="ltr"]');

    // If not found, get the first direct reply (case 2)
    if (!firstDiv) {
      firstDiv = doc.querySelector('div[dir="ltr"]:not(.gmail_attr)');
    }

    const latestReplyHtml = firstDiv?.innerHTML || "";

    return {
      latestReply: `<div dir="ltr">${latestReplyHtml}</div>`,
      originalThread: quoteContainer.outerHTML,
    };
  }

  return { latestReply: html, originalThread: "" };
}
