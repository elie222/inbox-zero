export function getLatestScheduledSendId(
  rows: readonly {
    id: string;
    status: string;
    sentAt: Date | string | null;
  }[],
) {
  let latestId = "";
  let latestSentAt = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (row.status !== "SENT" || !row.sentAt) continue;
    const sentAt = new Date(row.sentAt).getTime();
    if (sentAt > latestSentAt) {
      latestId = row.id;
      latestSentAt = sentAt;
    }
  }
  return latestId;
}
