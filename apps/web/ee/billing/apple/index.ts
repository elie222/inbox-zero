import {
  APIError,
  APIException,
  AppStoreServerAPIClient,
  Environment,
  Status,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import { after } from "next/server";
import { getAppleSubscriptionTier } from "@/app/(app)/premium/config";
import { env } from "@/env";
import { SafeError, captureException } from "@/utils/error";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { createPremiumForUser } from "@/utils/premium/create-premium";

type AppleEnvironment = Environment.PRODUCTION | Environment.SANDBOX;

type AppleSubscriptionState = {
  appAccountToken: string | null;
  environment: AppleEnvironment;
  expiresAt: Date | null;
  latestTransactionId: string | null;
  originalTransactionId: string;
  productId: string;
  purchaseDate: Date | null;
  revokedAt: Date | null;
  status: string;
  subscriptionGroupIdentifier: string | null;
  tier: ReturnType<typeof getAppleSubscriptionTier>;
};

const APPLE_ACTIVE_STATUSES = new Set([
  "ACTIVE",
  "BILLING_GRACE_PERIOD",
  "BILLING_RETRY",
]);

let productionClient: AppStoreServerAPIClient | null = null;
let sandboxClient: AppStoreServerAPIClient | null = null;

function getAppleSigningKey() {
  return env.APPLE_IAP_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

function assertAppleConfig() {
  if (
    !env.APPLE_IAP_ISSUER_ID ||
    !env.APPLE_IAP_KEY_ID ||
    !getAppleSigningKey() ||
    !env.APPLE_IAP_BUNDLE_ID
  ) {
    throw new Error("Apple IAP server configuration is incomplete");
  }
}

function getAppleClient(environment: AppleEnvironment) {
  assertAppleConfig();

  if (environment === Environment.PRODUCTION) {
    productionClient ||= new AppStoreServerAPIClient(
      getAppleSigningKey()!,
      env.APPLE_IAP_KEY_ID!,
      env.APPLE_IAP_ISSUER_ID!,
      env.APPLE_IAP_BUNDLE_ID!,
      Environment.PRODUCTION,
    );

    return productionClient;
  }

  sandboxClient ||= new AppStoreServerAPIClient(
    getAppleSigningKey()!,
    env.APPLE_IAP_KEY_ID!,
    env.APPLE_IAP_ISSUER_ID!,
    env.APPLE_IAP_BUNDLE_ID!,
    Environment.SANDBOX,
  );

  return sandboxClient;
}

function normalizeAppleEnvironment(
  value: string | null | undefined,
): AppleEnvironment | null {
  if (!value) return null;
  if (value === Environment.PRODUCTION) return Environment.PRODUCTION;
  if (
    value === Environment.SANDBOX ||
    value === Environment.XCODE ||
    value === Environment.LOCAL_TESTING
  ) {
    return Environment.SANDBOX;
  }

  return null;
}

function isRetryableAppleLookupError(error: unknown) {
  return (
    error instanceof APIException &&
    (error.apiError === APIError.INVALID_TRANSACTION_ID ||
      error.apiError === APIError.INVALID_ORIGINAL_TRANSACTION_ID)
  );
}

function getLookupEnvironments(
  environmentHint?: string | null,
): AppleEnvironment[] {
  const normalized = normalizeAppleEnvironment(environmentHint);
  if (normalized === Environment.PRODUCTION) {
    return [Environment.PRODUCTION, Environment.SANDBOX];
  }
  if (normalized === Environment.SANDBOX) {
    return [Environment.SANDBOX, Environment.PRODUCTION];
  }

  return [Environment.PRODUCTION, Environment.SANDBOX];
}

function decodeSignedPayloadUnsafe<T>(signedPayload: string): T {
  const [, payload] = signedPayload.split(".");
  if (!payload) throw new Error("Invalid signed payload");

  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = Buffer.from(padded, "base64").toString("utf8");

  return JSON.parse(decoded) as T;
}

function toDate(value: number | null | undefined) {
  if (!value) return null;
  return new Date(value);
}

function getAppleStatusName(status: Status | number | null | undefined) {
  if (typeof status !== "number") return null;
  return Status[status] ?? null;
}

function deriveFallbackAppleStatus(
  transaction: JWSTransactionDecodedPayload,
): string {
  if (transaction.revocationDate) return "REVOKED";
  if (!transaction.expiresDate) return "ACTIVE";
  return transaction.expiresDate > Date.now() ? "ACTIVE" : "EXPIRED";
}

function sortAppleStatusCandidates(
  a: {
    expiresAt: Date | null;
    originalTransactionId: string | null;
    purchaseDate: Date | null;
    status: string;
  },
  b: {
    expiresAt: Date | null;
    originalTransactionId: string | null;
    purchaseDate: Date | null;
    status: string;
  },
) {
  const aActive = APPLE_ACTIVE_STATUSES.has(a.status) ? 1 : 0;
  const bActive = APPLE_ACTIVE_STATUSES.has(b.status) ? 1 : 0;
  if (aActive !== bActive) return bActive - aActive;

  const aExpires = a.expiresAt?.getTime() ?? 0;
  const bExpires = b.expiresAt?.getTime() ?? 0;
  if (aExpires !== bExpires) return bExpires - aExpires;

  const aPurchased = a.purchaseDate?.getTime() ?? 0;
  const bPurchased = b.purchaseDate?.getTime() ?? 0;
  return bPurchased - aPurchased;
}

async function lookupTransactionInEnvironment({
  environment,
  logger,
  transactionId,
}: {
  environment: AppleEnvironment;
  logger: Logger;
  transactionId: string;
}) {
  const client = getAppleClient(environment);
  const transactionInfo = await client.getTransactionInfo(transactionId);
  const signedTransactionInfo = transactionInfo.signedTransactionInfo;

  if (!signedTransactionInfo) {
    throw new Error(
      "Apple transaction lookup returned no signedTransactionInfo",
    );
  }

  const baseTransaction =
    decodeSignedPayloadUnsafe<JWSTransactionDecodedPayload>(
      signedTransactionInfo,
    );

  const statusResponse = await client.getAllSubscriptionStatuses(
    baseTransaction.originalTransactionId || transactionId,
  );

  const candidates =
    statusResponse.data?.flatMap((group) =>
      (group.lastTransactions || [])
        .map((lastTransaction) => {
          const signedCandidate = lastTransaction.signedTransactionInfo;
          if (!signedCandidate) return null;

          try {
            const decoded =
              decodeSignedPayloadUnsafe<JWSTransactionDecodedPayload>(
                signedCandidate,
              );

            return {
              decoded,
              expiresAt: toDate(decoded.expiresDate),
              item: lastTransaction,
              originalTransactionId: decoded.originalTransactionId || null,
              purchaseDate: toDate(decoded.purchaseDate),
              status:
                getAppleStatusName(lastTransaction.status) ||
                deriveFallbackAppleStatus(decoded),
            };
          } catch (error) {
            logger.warn("Failed to decode Apple subscription candidate", {
              environment,
              error,
              transactionId,
            });
            return null;
          }
        })
        .filter((value): value is NonNullable<typeof value> => Boolean(value)),
    ) || [];

  const baseOriginalTransactionId =
    baseTransaction.originalTransactionId || transactionId;

  const matchingCandidates = candidates.filter(
    (candidate) =>
      candidate.originalTransactionId === baseOriginalTransactionId,
  );

  const chosenCandidate = (
    matchingCandidates.length ? matchingCandidates : candidates
  )
    .slice()
    .sort(sortAppleStatusCandidates)[0];

  const selectedTransaction = chosenCandidate?.decoded || baseTransaction;
  const selectedItem = chosenCandidate?.item;

  return {
    appAccountToken: selectedTransaction.appAccountToken || null,
    environment,
    expiresAt: toDate(selectedTransaction.expiresDate),
    latestTransactionId: selectedTransaction.transactionId || null,
    originalTransactionId:
      selectedTransaction.originalTransactionId || transactionId,
    productId: selectedTransaction.productId || "",
    purchaseDate: toDate(selectedTransaction.purchaseDate),
    revokedAt: toDate(selectedTransaction.revocationDate),
    status:
      getAppleStatusName(selectedItem?.status) ||
      deriveFallbackAppleStatus(selectedTransaction),
    subscriptionGroupIdentifier:
      selectedTransaction.subscriptionGroupIdentifier || null,
    tier: selectedTransaction.productId
      ? getAppleSubscriptionTier({ productId: selectedTransaction.productId })
      : null,
  } satisfies AppleSubscriptionState;
}

export async function getAppleSubscriptionState({
  environmentHint,
  logger,
  transactionId,
}: {
  environmentHint?: string | null;
  logger: Logger;
  transactionId: string;
}) {
  let lastError: unknown;

  for (const environment of getLookupEnvironments(environmentHint)) {
    try {
      const result = await lookupTransactionInEnvironment({
        environment,
        logger,
        transactionId,
      });

      if (!result.productId) {
        throw new Error("Apple transaction has no productId");
      }

      return result;
    } catch (error) {
      lastError = error;

      logger.warn("Apple transaction lookup failed in environment", {
        environment,
        error,
        transactionId,
      });

      if (!isRetryableAppleLookupError(error)) {
        break;
      }
    }
  }

  captureException(lastError, { extra: { transactionId } });
  throw lastError instanceof Error
    ? lastError
    : new Error("Apple lookup failed");
}

async function resolvePremiumRecord({
  authenticatedUserId,
  logger,
  state,
}: {
  authenticatedUserId?: string;
  logger: Logger;
  state: AppleSubscriptionState;
}) {
  const existingPremium =
    (await prisma.premium.findFirst({
      where: {
        OR: [
          { appleOriginalTransactionId: state.originalTransactionId },
          ...(state.latestTransactionId
            ? [{ appleLatestTransactionId: state.latestTransactionId }]
            : []),
        ],
      },
      select: {
        id: true,
        users: { select: { id: true } },
      },
    })) || null;

  const existingUserIds = existingPremium?.users.map((user) => user.id) || [];

  if (
    authenticatedUserId &&
    state.appAccountToken &&
    state.appAccountToken !== authenticatedUserId &&
    !existingUserIds.includes(authenticatedUserId)
  ) {
    throw new SafeError("Apple purchase belongs to a different user");
  }

  const ownerUserId =
    authenticatedUserId || state.appAccountToken || existingUserIds[0] || null;

  if (existingPremium?.id) {
    return { premiumId: existingPremium.id, userIds: existingUserIds };
  }

  if (!ownerUserId) {
    logger.warn("Unable to map Apple subscription to a user", {
      originalTransactionId: state.originalTransactionId,
      transactionId: state.latestTransactionId,
    });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { premiumId: true },
  });

  if (!user) {
    logger.warn("Apple subscription user not found", {
      ownerUserId,
      originalTransactionId: state.originalTransactionId,
    });
    return null;
  }

  const premium = user.premiumId
    ? { id: user.premiumId }
    : await createPremiumForUser({ userId: ownerUserId });

  return { premiumId: premium.id, userIds: [ownerUserId] };
}

export async function syncAppleSubscriptionToDb({
  authenticatedUserId,
  environmentHint,
  logger,
  transactionId,
}: {
  authenticatedUserId?: string;
  environmentHint?: string | null;
  logger: Logger;
  transactionId: string;
}) {
  const state = await getAppleSubscriptionState({
    environmentHint,
    logger,
    transactionId,
  });

  if (!state.tier) {
    throw new SafeError(
      `Apple product ${state.productId} is not mapped to a premium tier`,
    );
  }

  const premiumRecord = await resolvePremiumRecord({
    authenticatedUserId,
    logger,
    state,
  });

  if (!premiumRecord) return null;

  const previousPremium = await prisma.premium.findUnique({
    where: { id: premiumRecord.premiumId },
    select: {
      appleExpiresAt: true,
      appleRevokedAt: true,
      appleSubscriptionStatus: true,
      tier: true,
      users: { select: { id: true } },
    },
  });

  const updatedPremium = await prisma.premium.update({
    where: { id: premiumRecord.premiumId },
    data: {
      appleAppAccountToken: state.appAccountToken,
      appleEnvironment: state.environment,
      appleExpiresAt: state.expiresAt,
      appleLatestTransactionId: state.latestTransactionId,
      appleOriginalTransactionId: state.originalTransactionId,
      appleProductId: state.productId,
      applePurchaseDate: state.purchaseDate,
      appleRevokedAt: state.revokedAt,
      appleSubscriptionGroupIdentifier: state.subscriptionGroupIdentifier,
      appleSubscriptionStatus: state.status,
      emailAccountsAccess: 1,
      tier: state.tier,
    },
    select: {
      id: true,
      appleEnvironment: true,
      appleExpiresAt: true,
      appleProductId: true,
      appleRevokedAt: true,
      appleSubscriptionStatus: true,
      tier: true,
      users: { select: { id: true } },
    },
  });

  after(() => {
    const userIds = updatedPremium.users.map((user) => user.id);
    const statusChanged =
      previousPremium?.appleSubscriptionStatus !== state.status ||
      previousPremium?.appleRevokedAt?.getTime() !==
        state.revokedAt?.getTime() ||
      previousPremium?.appleExpiresAt?.getTime() !==
        state.expiresAt?.getTime() ||
      previousPremium?.tier !== state.tier;

    if (userIds.length && (!previousPremium || statusChanged)) {
      ensureEmailAccountsWatched({ userIds, logger }).catch((error) => {
        logger.error("Failed to ensure email watches after Apple sync", {
          error,
          originalTransactionId: state.originalTransactionId,
          userIds,
        });
      });
    }
  });

  return updatedPremium;
}

export function decodeAppleNotificationPayload(signedPayload: string) {
  return decodeSignedPayloadUnsafe<ResponseBodyV2DecodedPayload>(signedPayload);
}

export function decodeAppleTransactionPayload(signedTransactionInfo: string) {
  return decodeSignedPayloadUnsafe<JWSTransactionDecodedPayload>(
    signedTransactionInfo,
  );
}
