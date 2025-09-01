import type { Client } from "@microsoft/microsoft-graph-client";
import addDays from "date-fns/addDays";
import { env } from "@/env";

export async function watchOutlook(client: Client) {
  const subscriptionPayload = {
    changeType: "created,updated",
    // must be https
    notificationUrl: `${env.NODE_ENV === "development" ? env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL : env.NEXT_PUBLIC_BASE_URL}/api/outlook/webhook`,
    resource: "/me/mailFolders/inbox/messages",
    expirationDateTime: addDays(new Date(), 3).toISOString(), // 3 days (max allowed)
    clientState: env.MICROSOFT_WEBHOOK_CLIENT_STATE,
  };

  const subscription = await client
    .api("/subscriptions")
    .post(subscriptionPayload);

  return {
    id: subscription.id,
    expirationDateTime: subscription.expirationDateTime,
  };
}

export async function unwatchOutlook(client: Client, subscriptionId: string) {
  await client.api(`/subscriptions/${subscriptionId}`).delete();
}
