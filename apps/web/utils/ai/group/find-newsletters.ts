import { gmail_v1 } from "googleapis";
import uniq from "lodash/uniq";
import { queryBatchMessagesPages } from "@/utils/gmail/message";

export async function findNewsletters(
  gmail: gmail_v1.Gmail,
  accessToken: string,
) {
  const messages = await queryBatchMessagesPages(gmail, accessToken, {
    query: "newsletter",
    maxResults: 100,
  });

  return uniq(messages.map((message) => message.parsedMessage.headers.from));
}
