import { createPrivateKey, createSign } from "node:crypto";
import http2 from "node:http2";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";

const APNS_PRODUCTION_HOST = "https://api.push.apple.com";
const APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com";
const APNS_JWT_TTL_SECONDS = 50 * 60;
const DEFAULT_TOPIC = "com.getinboxzero.app";
const DEFAULT_TEAM_ID = "Z46U4K6CNL";

export type ApnsAlert = {
  title: string;
  body: string;
  sound?: "default";
  data?: Record<string, string>;
};

export type RecordedApnsSend = {
  token: string;
  topic: string;
  sandbox: boolean;
  payload: Record<string, unknown>;
};

type ApnsDelivery = {
  token: string;
  status: number;
  reason: string | null;
};

const recordedSends: RecordedApnsSend[] = [];
let cachedJwt: { value: string; expiresAtSeconds: number } | null = null;

export function isFakeApnsTransport() {
  return env.APNS_TRANSPORT === "fake";
}

export function takeRecordedApnsSends() {
  return recordedSends.splice(0, recordedSends.length);
}

export async function deliverApnsNotifications({
  tokens,
  notification,
  logger,
}: {
  tokens: string[];
  notification: ApnsAlert;
  logger: Logger;
}): Promise<{ unregisteredTokens: string[]; retryTokens: string[] }> {
  if (tokens.length === 0) return { unregisteredTokens: [], retryTokens: [] };

  const topic = env.APNS_TOPIC || DEFAULT_TOPIC;
  const sandbox = apnsUsesSandbox();
  const payload = apnsPayload(notification);

  if (isFakeApnsTransport()) {
    for (const token of tokens) {
      recordedSends.push({ token, topic, sandbox, payload });
    }
    return { unregisteredTokens: [], retryTokens: [] };
  }

  const authorization = apnsAuthorization();
  if (!authorization) {
    logger.warn("APNs credentials are not configured");
    return { unregisteredTokens: [], retryTokens: tokens };
  }

  const deliveries = await Promise.all(
    tokens.map(async (token) => {
      try {
        return await postApns({
          authorization,
          payload,
          sandbox,
          token,
          topic,
        });
      } catch (error) {
        logger.warn("APNs request failed", { error });
        return { token, status: 500, reason: null } satisfies ApnsDelivery;
      }
    }),
  );

  const unregisteredTokens: string[] = [];
  const retryTokens: string[] = [];
  for (const delivery of deliveries) {
    if (delivery.status === 200) continue;
    if (delivery.status === 410 || delivery.reason === "Unregistered") {
      unregisteredTokens.push(delivery.token);
      continue;
    }
    if (delivery.status === 429 || delivery.status >= 500) {
      retryTokens.push(delivery.token);
    }
    logger.warn("APNs rejected a notification", {
      reason: delivery.reason,
      status: delivery.status,
    });
  }

  return { unregisteredTokens, retryTokens };
}

function apnsUsesSandbox() {
  if (env.APNS_ENVIRONMENT === "production") return false;
  if (env.APNS_ENVIRONMENT === "sandbox") return true;
  return env.NODE_ENV !== "production";
}

function apnsPayload(notification: ApnsAlert) {
  return {
    aps: {
      alert: {
        title: notification.title,
        body: notification.body,
      },
      sound: notification.sound ?? "default",
    },
    ...(notification.data ?? {}),
  };
}

function apnsAuthorization() {
  const privateKey = env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const keyId = env.APNS_KEY_ID;
  const teamId = env.APNS_TEAM_ID || DEFAULT_TEAM_ID;
  if (!privateKey || !keyId) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAtSeconds > now + 60)
    return cachedJwt.value;

  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64Url(JSON.stringify({ iss: teamId, iat: now }));
  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = signer.sign({
    key: createPrivateKey(privateKey),
    dsaEncoding: "ieee-p1363",
  });
  const value = `${header}.${payload}.${base64Url(signature)}`;
  cachedJwt = { value, expiresAtSeconds: now + APNS_JWT_TTL_SECONDS };
  return value;
}

function postApns({
  authorization,
  payload,
  sandbox,
  token,
  topic,
}: {
  authorization: string;
  payload: Record<string, unknown>;
  sandbox: boolean;
  token: string;
  topic: string;
}): Promise<ApnsDelivery> {
  const host = sandbox ? APNS_SANDBOX_HOST : APNS_PRODUCTION_HOST;
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const client = http2.connect(host);
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${authorization}`,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-topic": topic,
      "content-type": "application/json",
    });
    const chunks: Buffer[] = [];
    request.setTimeout(10_000, () => {
      request.close();
      client.close();
      reject(new Error("APNs request timed out"));
    });
    request.on("response", (headers) => {
      const status = Number(headers[":status"] ?? 0);
      request.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        client.close();
        const raw = Buffer.concat(chunks).toString("utf8");
        let reason: string | null = null;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { reason?: string };
            reason = parsed.reason ?? null;
          } catch {
            reason = null;
          }
        }
        resolve({ token, status, reason });
      });
    });
    request.on("error", (error) => {
      client.close();
      reject(error);
    });
    request.end(body);
  });
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}
