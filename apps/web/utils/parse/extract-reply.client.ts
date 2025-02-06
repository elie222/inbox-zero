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
      console.warn("Failed to parse HTML - received null content");
      return { draftHtml: html, originalHtml: "" };
    }

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
        draftHtml: `<div dir="ltr">${latestReplyHtml}</div>`,
        originalHtml: quoteContainer.outerHTML,
      };
    }

    return { draftHtml: html, originalHtml: "" };
  } catch (error) {
    console.error("Error parsing email HTML:", error);
    return { draftHtml: html, originalHtml: "" };
  }
}
