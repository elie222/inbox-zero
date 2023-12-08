import * as cheerio from "cheerio";

export function findUnsubscribeLink(html?: string | null) {
  if (!html) return;

  const $ = cheerio.load(html);
  let unsubscribeLink: string | undefined;

  $("a").each((_index, element) => {
    const text = $(element).text().toLowerCase();
    if (
      text.includes("unsubscribe") ||
      text.includes("email preferences") ||
      text.includes("email settings") ||
      text.includes("email options")
    ) {
      unsubscribeLink = $(element).attr("href");
      console.debug(
        `Found link with text '${text}' and a link: ${unsubscribeLink}`,
      );
      return false; // break the loop
    }

    const href = $(element).attr("href")?.toLowerCase() || "";
    if (href.includes("unsubcribe")) {
      unsubscribeLink = $(element).attr("href");
      console.debug(
        `Found link with href '${href}' and a link: ${unsubscribeLink}`,
      );
      return false; // break the loop
    }
  });

  if (unsubscribeLink) return unsubscribeLink;

  // if we didn't find a link yet, try looking for lines that include the word unsubscribe
  // with a link in the same line.

  // nodeType of 3 represents a text node, which is the actual text inside an element or attribute.
  const textNodes = $("*")
    .contents()
    .filter((_index, content) => {
      return content.nodeType === 3 && content.data.includes("unsubscribe");
    });

  textNodes.each((_index, textNode) => {
    // Find the closest parent that has an 'a' tag
    const parent = $(textNode).parent();
    const link = parent.find("a").attr("href");
    if (link) {
      console.debug(`Found text including 'unsubscribe' and a link: ${link}`);
      unsubscribeLink = link;
      return false; // break the loop
    }
  });

  return unsubscribeLink;
}

export function getHeaderUnsubscribe(headers: { "List-Unsubscribe"?: string }) {
  return headers["List-Unsubscribe"] || undefined;
}
