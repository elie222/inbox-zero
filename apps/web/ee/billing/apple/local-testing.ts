import { importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose";
import { env } from "@/env";

/**
 * Throwaway P-256 key used only when `APPLE_IAP_LOCAL_TESTING` is on and the
 * process is not production. It is not an App Store key.
 */
const LOCAL_TESTING_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgQnTx4vMWzwmucC5t
Uqc71hujgnvXYHTm/OE2YZqza76hRANCAAREuRiHRlIGSYMgNNPvJqz6z6RqU4me
5nDhGaIwGYSzqREI/d535b1B+QPZMnCUsBkswFOUYu5NVbVIEof+KJJo
-----END PRIVATE KEY-----`;

const LOCAL_TESTING_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAERLkYh0ZSBkmDIDTT7yas+s+kalOJ
nuZw4RmiMBmEs6kRCP3ed+W9QfkD2TJwlLAZLMBTlGLuTVW1SBKH/iiSaA==
-----END PUBLIC KEY-----`;

const DEFAULT_BUNDLE_ID = "com.getinboxzero.app";

export function isAppleLocalTestingEnabled() {
  return env.NODE_ENV !== "production" && Boolean(env.APPLE_IAP_LOCAL_TESTING);
}

export function localAppleBundleId() {
  return env.APPLE_IAP_BUNDLE_ID || DEFAULT_BUNDLE_ID;
}

export async function signLocalAppleTransaction(
  claims: Record<string, unknown>,
) {
  const key = await importPKCS8(LOCAL_TESTING_PRIVATE_KEY, "ES256");
  return new SignJWT({
    bundleId: localAppleBundleId(),
    environment: "LocalTesting",
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .sign(key);
}

export async function verifyLocalAppleTransaction(signedTransaction: string) {
  const key = await importSPKI(LOCAL_TESTING_PUBLIC_KEY, "ES256");
  try {
    const { payload } = await jwtVerify(signedTransaction, key, {
      algorithms: ["ES256"],
    });
    if (payload.bundleId !== localAppleBundleId()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function signLocalAppleNotification({
  notificationType,
  subtype,
  transaction,
}: {
  notificationType: string;
  subtype?: string;
  transaction: Record<string, unknown>;
}) {
  const signedTransactionInfo = await signLocalAppleTransaction(transaction);
  const key = await importPKCS8(LOCAL_TESTING_PRIVATE_KEY, "ES256");
  return new SignJWT({
    notificationType,
    notificationUUID: crypto.randomUUID(),
    subtype,
    data: {
      environment: "LocalTesting",
      signedTransactionInfo,
    },
  })
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .sign(key);
}

export async function verifyLocalAppleNotification(signedPayload: string) {
  const key = await importSPKI(LOCAL_TESTING_PUBLIC_KEY, "ES256");
  try {
    const { payload } = await jwtVerify(signedPayload, key, {
      algorithms: ["ES256"],
    });
    const data =
      payload.data && typeof payload.data === "object" ? payload.data : null;
    const signedTransactionInfo =
      data &&
      "signedTransactionInfo" in data &&
      typeof data.signedTransactionInfo === "string"
        ? data.signedTransactionInfo
        : null;
    const transaction = signedTransactionInfo
      ? await verifyLocalAppleTransaction(signedTransactionInfo)
      : null;
    if (!transaction) return null;
    return { notification: payload, transaction };
  } catch {
    return null;
  }
}
