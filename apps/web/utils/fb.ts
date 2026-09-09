import { createHash } from "node:crypto";
import { env } from "@/env";

type FacebookConversionEventName =
  | "CompleteRegistration"
  | "StartTrial"
  | "Subscribe";

type FacebookCustomData = Record<string, string | number | boolean | string[]>;

export const sendCompleteRegistrationEvent = async ({
  userId,
  email,
  eventId,
  eventSourceUrl,
  ipAddress,
  userAgent,
  fbc,
  fbp,
}: {
  userId: string;
  email: string;
  eventId: string;
  eventSourceUrl: string;
  ipAddress: string;
  userAgent: string;
  fbc: string;
  fbp: string;
}) =>
  sendFacebookConversionEvent({
    eventName: "CompleteRegistration",
    eventTime: new Date(),
    eventId,
    eventSourceUrl,
    userId,
    email,
    ipAddress,
    userAgent,
    fbc,
    fbp,
  });

export async function sendFacebookConversionEvent({
  eventName,
  eventTime,
  eventId,
  eventSourceUrl,
  userId,
  email,
  ipAddress,
  userAgent,
  fbc,
  fbp,
  customData = {},
}: {
  eventName: FacebookConversionEventName;
  eventTime: Date;
  eventId: string;
  eventSourceUrl: string;
  userId: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
  fbc?: string;
  fbp?: string;
  customData?: FacebookCustomData;
}) {
  const accessToken = env.FB_CONVERSION_API_ACCESS_TOKEN;
  const pixelId = env.FB_PIXEL_ID;
  const apiVersion = "v20.0";

  if (!accessToken || !pixelId) return;

  const url = `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${accessToken}`;

  const data = {
    event_name: eventName,
    event_time: Math.floor(eventTime.getTime() / 1000),
    event_id: eventId,
    action_source: "website",
    event_source_url: eventSourceUrl,
    user_data: {
      em: [hash(email.trim().toLowerCase())],
      external_id: hash(userId),
      ...(ipAddress ? { client_ip_address: ipAddress } : {}),
      ...(userAgent ? { client_user_agent: userAgent } : {}),
      ...(fbc ? { fbc } : {}),
      ...(fbp ? { fbp } : {}),
    },
    custom_data: customData,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [data] }),
  });

  if (!response.ok) {
    throw new Error(`Facebook conversion event failed: ${response.status}`);
  }

  return { success: true };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
