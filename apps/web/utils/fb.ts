import { createHash } from "node:crypto";
import { env } from "@/env";

export const sendCompleteRegistrationEvent = async ({
  userId,
  email,
  eventSourceUrl,
  ipAddress,
  userAgent,
  fbc,
  fbp,
}: {
  userId: string;
  email: string;
  eventSourceUrl: string;
  ipAddress: string;
  userAgent: string;
  fbc: string;
  fbp: string;
}) => {
  const accessToken = env.FB_CONVERSION_API_ACCESS_TOKEN;
  const pixelId = env.FB_PIXEL_ID;
  const apiVersion = "v20.0";

  if (!accessToken || !pixelId) return;

  const url = `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${accessToken}`;

  const data = {
    event_name: "CompleteRegistration",
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    event_source_url: eventSourceUrl,
    user_data: {
      em: [hash(email)],
      external_id: hash(userId),
      client_ip_address: ipAddress,
      client_user_agent: userAgent,
      fbc,
      fbp,
    },
    custom_data: {},
  };

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [data] }),
  });

  return { success: true };
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
