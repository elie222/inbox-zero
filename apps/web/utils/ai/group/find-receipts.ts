import { gmail_v1 } from "googleapis";
import uniq from "lodash/uniq";
import { queryBatchMessagesPages } from "@/utils/gmail/message";

// TODO this can be a mix of subject lines and from to find who actually sends receipts
export async function findReceipts(gmail: gmail_v1.Gmail, accessToken: string) {
  const messages = await queryBatchMessagesPages(gmail, accessToken, {
    query: "receipt",
    maxResults: 100,
  });

  return uniq(messages.map((message) => message.parsedMessage.headers.from));
}
