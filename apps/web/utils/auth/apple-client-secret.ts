import { createPrivateKey, createSign } from "node:crypto";
import { env } from "@/env";

const appleTokenAudience = "https://appleid.apple.com";
export const appleClientSecretTtlSeconds = 180 * 24 * 60 * 60;
const appleClientSecretRefreshBufferSeconds = 24 * 60 * 60;

let cachedAppleClientSecret:
  | {
      value: string;
      refreshAtSeconds: number;
    }
  | undefined;

export function getAppleClientSecret() {
  const now = Math.floor(Date.now() / 1000);

  if (
    cachedAppleClientSecret &&
    cachedAppleClientSecret.refreshAtSeconds > now
  ) {
    return cachedAppleClientSecret.value;
  }

  const clientSecret = generateAppleClientSecret(now);
  if (!clientSecret) return null;

  cachedAppleClientSecret = {
    value: clientSecret,
    refreshAtSeconds:
      now + appleClientSecretTtlSeconds - appleClientSecretRefreshBufferSeconds,
  };

  return clientSecret;
}

function generateAppleClientSecret(now: number) {
  const privateKey = env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (
    !env.APPLE_CLIENT_ID ||
    !env.APPLE_TEAM_ID ||
    !env.APPLE_KEY_ID ||
    !privateKey
  ) {
    return null;
  }

  return signAppleJwt(
    {
      iss: env.APPLE_TEAM_ID,
      sub: env.APPLE_CLIENT_ID,
      aud: appleTokenAudience,
      iat: now,
      exp: now + appleClientSecretTtlSeconds,
    },
    privateKey,
  );
}

function signAppleJwt(
  payload: Record<string, string | number>,
  privateKeyPem: string,
) {
  const encodedHeader = base64UrlEncode(
    JSON.stringify({ alg: "ES256", kid: env.APPLE_KEY_ID, typ: "JWT" }),
  );
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("SHA256");

  signer.update(signingInput);
  signer.end();

  const signature = signer.sign({
    key: createPrivateKey(privateKeyPem),
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}
