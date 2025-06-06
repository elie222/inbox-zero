import type { gmail_v1 } from "@googleapis/gmail";

export async function getFilters(gmail: gmail_v1.Gmail) {
  const res = await gmail.users.settings.filters.list({ userId: "me" });
  return res.data.filter || [];
}

export async function getForwardingAddresses(gmail: gmail_v1.Gmail) {
  const res = await gmail.users.settings.forwardingAddresses.list({
    userId: "me",
  });
  return res.data.forwardingAddresses || [];
}
