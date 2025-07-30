export function extractEmailReply(html: string): {
  draftHtml: string;
  originalHtml: string;
} {
  if (!html?.trim()) {
    return { draftHtml: html, originalHtml: "" };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    if (doc.body.innerHTML === "null") {
      // biome-ignore lint/suspicious/noConsole: helpful for debugging
      console.warn("Failed to parse HTML - received null content");
      return { draftHtml: html, originalHtml: "" };
    }

    // Find the first gmail_quote container
    const quoteContainer = doc.querySelector(
      ".gmail_quote_container, .gmail_quote",
    );

    if (quoteContainer) {
      // Special case for Gmail's <br> separator format
      if (
        html.includes('<div dir="ltr">') &&
        html.includes("<br>") &&
        html.indexOf("<br>") < html.indexOf("gmail_quote")
      ) {
        // Get the content before the <br> that precedes the gmail_quote
        const _replyPart = html.substring(0, html.indexOf("<br>"));

        // Use the original document and just return the outerHTML of the first div[dir="ltr"]
        const topLevelReplyDiv = doc.querySelector('div[dir="ltr"]');

        if (topLevelReplyDiv) {
          return {
            draftHtml: topLevelReplyDiv.outerHTML,
            originalHtml: quoteContainer.outerHTML,
          };
        }
      }

      // Try to get nested reply first (case 1)
      let firstDiv = doc.querySelector('div[dir="ltr"] > div[dir="ltr"]');

      // If not found, get the first direct reply (case 2)
      if (!firstDiv) {
        firstDiv = doc.querySelector('div[dir="ltr"]:not(.gmail_attr)');
      }

      const latestReplyHtml = firstDiv?.innerHTML || "";

      return {
        draftHtml: `<div dir="ltr">${latestReplyHtml}</div>`,
        originalHtml: quoteContainer.outerHTML,
      };
    }

    return { draftHtml: html, originalHtml: "" };
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: helpful for debugging
    console.error("Error parsing email HTML:", error);
    return { draftHtml: html, originalHtml: "" };
  }
}
