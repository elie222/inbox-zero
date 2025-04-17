import type { gmail_v1 } from "@googleapis/gmail";
import uniq from "lodash/uniq";
import { queryBatchMessagesPages } from "@/utils/gmail/message";

export const newsletterSenders = [
  "substack.com",
  "mail.beehiiv.com",
  "ghost.io",
];
const ignoreList = ["@github.com", "@google.com", "@gmail.com", "@slack.com"];

export async function findNewsletters(
  gmail: gmail_v1.Gmail,
  userEmail: string,
) {
  const messages = await queryBatchMessagesPages(gmail, {
    query: "newsletter",
    maxResults: 100,
  });
  const messages2 = await queryBatchMessagesPages(gmail, {
    query: `from:(${newsletterSenders.join(" OR ")})`,
    maxResults: 100,
  });

  return uniq(
    [...messages, ...messages2]
      .map((message) => message.headers.from)
      .filter(
        (from) =>
          !ignoreList.find((ignore) => from.includes(ignore)) &&
          !from.includes(userEmail),
      ),
  );
}

export function isNewsletterSender(sender: string) {
  return (
    sender.toLowerCase().includes("newsletter") ||
    newsletterSenders.some((newsletter) => sender.includes(newsletter))
  );
}
