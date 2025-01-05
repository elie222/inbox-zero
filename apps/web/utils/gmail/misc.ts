import type { gmail_v1 } from "@googleapis/gmail";

export async function getForwardingAddresses(gmail: gmail_v1.Gmail) {
  const res = await gmail.users.settings.forwardingAddresses.list({
    userId: "me",
  });
  return res.data;
}

export async function getHistory(
  gmail: gmail_v1.Gmail,
  options: {
    startHistoryId?: string;
    labelId?: string;
    historyTypes?: string[];
    maxResults?: number;
  },
) {
  const res = await gmail.users.history.list({
    userId: "me",
    startHistoryId: options.startHistoryId,
    labelId: options.labelId,
    historyTypes: options.historyTypes,
    maxResults: options.maxResults,
  });

  return res;
}

export async function watchUser(
  gmail: gmail_v1.Gmail,
  requestBody: {
    labelFilterAction?: string | null;
    labelFilterBehavior?: string | null;
    labelIds?: string[] | null;
    topicName?: string | null;
  },
) {
  const res = await gmail.users.watch({
    userId: "me",
    requestBody,
  });

  return res.data;
}

export async function unwatchUser(gmail: gmail_v1.Gmail) {
  await gmail.users.stop({ userId: "me" });
}
