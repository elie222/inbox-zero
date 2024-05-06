import { gmail_v1 } from "googleapis";
import uniq from "lodash/uniq";
import { queryBatchMessagesPages } from "@/utils/gmail/message";

const newsletterSenders = ["@substack.com", "@mail.beehiiv.com", "@ghost.io"];
const ignoreList = ["@github.com", "@google.com", "@gmail.com", "@slack.com"];

export async function findNewsletters(
  gmail: gmail_v1.Gmail,
  accessToken: string,
) {
  const messages = await queryBatchMessagesPages(gmail, accessToken, {
    query: "newsletter",
    maxResults: 100,
  });
  const messages2 = await queryBatchMessagesPages(gmail, accessToken, {
    query: `from:(${newsletterSenders.join(" OR ")})`,
    maxResults: 100,
  });

  return uniq(
    [...messages, ...messages2]
      .map((message) => message.headers.from)
      .filter((from) => !ignoreList.find((ignore) => from.includes(ignore))),
  );
}
