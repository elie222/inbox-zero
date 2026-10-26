import { createSign } from "node:crypto";
import { z } from "zod";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const FCM_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_ALERT_CHANNEL_ID = "mail";

export const FCM_REGISTRATION_TOKEN = /^\S{1,4096}$/;

export type FcmAlert = {
  title: string;
  subtitle?: string;
  body: string;
  channelId?: string;
  expiration?: number;
  data?: Record<string, string>;
};

export type FcmBackground = {
  pushType: "background";
  data: Record<string, string>;
};

export type FcmNotification = FcmAlert | FcmBackground;

type FcmMessage = {
  token: string;
  data?: Record<string, string>;
  notification?: { title: string; body: string };
  android: {
    priority: "NORMAL" | "HIGH";
    ttl?: string;
    notification?: { channel_id: string; sound: "default" };
  };
};

export type RecordedFcmSend = {
  token: string;
  projectId: string;
  message: FcmMessage;
};

type FcmDelivery = {
  token: string;
  status: number;
  errorCode: string | null;
  errorStatus: string | null;
};

const serviceAccountSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  project_id: z.string().min(1).optional(),
  token_uri: z.string().url().optional(),
});

const recordedSends: RecordedFcmSend[] = [];
let cachedAccessToken: { value: string; expiresAtMs: number } | null = null;

export function isFakeFcmTransport() {
  return env.FCM_TRANSPORT === "fake";
}

export function takeRecordedFcmSends() {
  return recordedSends.splice(0, recordedSends.length);
}

export function isFcmConfigured() {
  if (isFakeFcmTransport()) return true;
  return Boolean(fcmCredentials());
}

export function isStaleFcmToken(delivery: { errorCode: string | null }) {
  return delivery.errorCode === "UNREGISTERED";
}

export async function deliverFcmNotifications({
  tokens,
  notification,
  logger,
}: {
  tokens: string[];
  notification: FcmNotification;
  logger: Logger;
}): Promise<{ unregisteredTokens: string[]; retryTokens: string[] }> {
  if (tokens.length === 0) return { unregisteredTokens: [], retryTokens: [] };

  if (isFakeFcmTransport()) {
    const projectId = env.FCM_PROJECT_ID || "fake-project";
    for (const token of tokens) {
      recordedSends.push({
        token,
        projectId,
        message: fcmMessage(token, notification),
      });
    }
    return { unregisteredTokens: [], retryTokens: [] };
  }

  const credentials = fcmCredentials();
  if (!credentials) {
    logger.warn("FCM credentials are not configured");
    return { unregisteredTokens: [], retryTokens: tokens };
  }

  let accessToken: string;
  try {
    accessToken = await fcmAccessToken(credentials);
  } catch (error) {
    logger.warn("FCM access token request failed", { error });
    return { unregisteredTokens: [], retryTokens: tokens };
  }

  const deliveries = await Promise.all(
    tokens.map(async (token) => {
      try {
        return await postFcm({
          accessToken,
          projectId: credentials.projectId,
          message: fcmMessage(token, notification),
        });
      } catch (error) {
        logger.warn("FCM request failed", { error });
        return {
          token,
          status: 500,
          errorCode: null,
          errorStatus: null,
        } satisfies FcmDelivery;
      }
    }),
  );

  const unregisteredTokens: string[] = [];
  const retryTokens: string[] = [];
  for (const delivery of deliveries) {
    if (delivery.status === 200) continue;
    if (isStaleFcmToken(delivery)) {
      unregisteredTokens.push(delivery.token);
      continue;
    }
    if (delivery.status === 401) cachedAccessToken = null;
    if (
      delivery.status === 401 ||
      delivery.status === 429 ||
      delivery.status >= 500
    ) {
      retryTokens.push(delivery.token);
    }
    logger.warn("FCM rejected a notification", {
      errorCode: delivery.errorCode,
      errorStatus: delivery.errorStatus,
      status: delivery.status,
    });
  }

  return { unregisteredTokens, retryTokens };
}

function isBackgroundNotification(
  notification: FcmNotification,
): notification is FcmBackground {
  return "pushType" in notification && notification.pushType === "background";
}

function fcmMessage(token: string, notification: FcmNotification): FcmMessage {
  // Android demotes high-priority pushes that show no notification.
  if (isBackgroundNotification(notification)) {
    return {
      token,
      data: notification.data,
      android: { priority: "NORMAL" },
    };
  }

  const ttlSeconds =
    notification.expiration === undefined
      ? undefined
      : Math.max(0, notification.expiration - Math.floor(Date.now() / 1000));

  return {
    token,
    notification: {
      title: notification.title,
      body: notification.subtitle
        ? `${notification.subtitle}\n${notification.body}`
        : notification.body,
    },
    ...(notification.data ? { data: notification.data } : {}),
    android: {
      priority: "HIGH",
      ...(ttlSeconds === undefined ? {} : { ttl: `${ttlSeconds}s` }),
      notification: {
        channel_id: notification.channelId ?? DEFAULT_ALERT_CHANNEL_ID,
        sound: "default",
      },
    },
  };
}

function fcmCredentials() {
  if (!env.FCM_SERVICE_ACCOUNT_JSON) return null;

  let parsed: z.infer<typeof serviceAccountSchema>;
  try {
    parsed = serviceAccountSchema.parse(
      JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON),
    );
  } catch {
    return null;
  }

  const projectId = env.FCM_PROJECT_ID || parsed.project_id;
  if (!projectId) return null;

  return {
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    projectId,
    tokenUri: parsed.token_uri || DEFAULT_TOKEN_URI,
  };
}

async function fcmAccessToken(
  credentials: NonNullable<ReturnType<typeof fcmCredentials>>,
) {
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > Date.now() + 60_000)
    return cachedAccessToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: FCM_SCOPE,
      aud: credentials.tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  const assertion = `${header}.${claims}.${base64Url(signer.sign(credentials.privateKey))}`;

  const response = await fetch(credentials.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(FCM_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`FCM token exchange failed with ${response.status}`);
  }
  const { access_token, expires_in } = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedAccessToken = {
    value: access_token,
    expiresAtMs: Date.now() + expires_in * 1000,
  };
  return access_token;
}

async function postFcm({
  accessToken,
  projectId,
  message,
}: {
  accessToken: string;
  projectId: string;
  message: FcmMessage;
}): Promise<FcmDelivery> {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(FCM_REQUEST_TIMEOUT_MS),
    },
  );
  if (response.ok) {
    await response.body?.cancel();
    return {
      token: message.token,
      status: response.status,
      errorCode: null,
      errorStatus: null,
    };
  }
  return {
    token: message.token,
    status: response.status,
    ...(await fcmError(response)),
  };
}

async function fcmError(
  response: Response,
): Promise<{ errorCode: string | null; errorStatus: string | null }> {
  try {
    const body = (await response.json()) as {
      error?: {
        status?: string;
        details?: Array<{ "@type"?: string; errorCode?: string }>;
      };
    };
    const detail = body.error?.details?.find(
      (item) =>
        item["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError",
    );
    return {
      errorCode: detail?.errorCode ?? null,
      errorStatus: body.error?.status ?? null,
    };
  } catch {
    return { errorCode: null, errorStatus: null };
  }
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}
