import type { Client } from "@microsoft/microsoft-graph-client";
import { env } from "@/env";

export async function watchOutlook(client: Client) {
  // Create a subscription for messages in the inbox
  const subscription = await client.api("/subscriptions").post({
    changeType: "created,updated",
    notificationUrl: `${env.NEXT_PUBLIC_BASE_URL}/api/outlook/webhook`,
    resource: "/me/mailFolders/inbox/messages",
    expirationDateTime: new Date(Date.now() + 4320 * 60000).toISOString(), // 3 days (max allowed)
  });

  return {
    id: subscription.id,
    expirationDateTime: subscription.expirationDateTime,
  };
}

export async function unwatchOutlook(client: Client, subscriptionId: string) {
  await client.api(`/subscriptions/${subscriptionId}`).delete();
}
