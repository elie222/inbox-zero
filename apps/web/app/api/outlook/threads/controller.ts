import type { ThreadsQuery } from "./validation";

export async function getOutlookThreads({
  accessToken,
  query,
}: {
  accessToken: string;
  query: ThreadsQuery;
}) {
  const params = new URLSearchParams();
  if (query.limit) params.set("$top", String(query.limit));
  if (query.nextPageToken) params.set("$skip", String(query.nextPageToken));

  const url =
    "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages" +
    "?" +
    params.toString() +
    "&$select=id,conversationId,subject,bodyPreview,from,receivedDateTime";

  const res = await fetch(url, {
    headers: { Authorization: "Bearer ${accessToken}" },
  });
  if (!res.ok) throw new Error(await res.text());
  const body = await res.json();
  return body.value;
}
