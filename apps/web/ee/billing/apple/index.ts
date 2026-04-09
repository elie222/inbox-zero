import {
  APIError,
  APIException,
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  Status,
  VerificationException,
  VerificationStatus,
  type JWSRenewalInfoDecodedPayload,
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
import { isOnHigherTier } from "@/utils/premium";
import { APPLE_ROOT_CERTIFICATES } from "./root-certificates";

type AppleEnvironment = Environment.PRODUCTION | Environment.SANDBOX;

type AppleLookupReference = {
  originalTransactionId?: string | null;
  transactionId?: string | null;
};

type AppleVerifiedNotification = {
  environment: AppleEnvironment;
  notification: ResponseBodyV2DecodedPayload;
  renewalInfo: JWSRenewalInfoDecodedPayload | null;
  transaction: JWSTransactionDecodedPayload | null;
};

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
let productionVerifier: SignedDataVerifier | null = null;
let sandboxVerifier: SignedDataVerifier | null = null;

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

function assertAppleVerificationConfig(environment: AppleEnvironment) {
  assertAppleConfig();

  if (environment === Environment.PRODUCTION && !env.APPLE_IAP_APPLE_ID) {
    throw new Error(
      "Apple IAP notification verification requires APPLE_IAP_APPLE_ID in production",
    );
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

function getAppleVerifier(environment: AppleEnvironment) {
  assertAppleVerificationConfig(environment);

  if (environment === Environment.PRODUCTION) {
    productionVerifier ||= new SignedDataVerifier(
      APPLE_ROOT_CERTIFICATES,
      true,
      Environment.PRODUCTION,
      env.APPLE_IAP_BUNDLE_ID!,
      env.APPLE_IAP_APPLE_ID!,
    );

    return productionVerifier;
  }

  sandboxVerifier ||= new SignedDataVerifier(
    APPLE_ROOT_CERTIFICATES,
    true,
    Environment.SANDBOX,
    env.APPLE_IAP_BUNDLE_ID!,
  );

  return sandboxVerifier;
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

function isRetryableAppleVerificationError(error: unknown) {
  return (
    error instanceof VerificationException &&
    (error.status === VerificationStatus.INVALID_APP_IDENTIFIER ||
      error.status === VerificationStatus.INVALID_ENVIRONMENT)
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

async function verifyAppleNotificationInEnvironment({
  environment,
  signedPayload,
}: {
  environment: AppleEnvironment;
  signedPayload: string;
}) {
  const verifier = getAppleVerifier(environment);
  const notification =
    await verifier.verifyAndDecodeNotification(signedPayload);

  const transaction = notification.data?.signedTransactionInfo
    ? await verifier.verifyAndDecodeTransaction(
        notification.data.signedTransactionInfo,
      )
    : null;
  const renewalInfo = notification.data?.signedRenewalInfo
    ? await verifier.verifyAndDecodeRenewalInfo(
        notification.data.signedRenewalInfo,
      )
    : null;

  return {
    environment,
    notification,
    renewalInfo,
    transaction,
  } satisfies AppleVerifiedNotification;
}

export async function verifyAppleNotificationPayload(signedPayload: string) {
  let lastError: unknown;

  for (const environment of getLookupEnvironments()) {
    try {
      return await verifyAppleNotificationInEnvironment({
        environment,
        signedPayload,
      });
    } catch (error) {
      lastError = error;

      if (!isRetryableAppleVerificationError(error)) {
        break;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Apple notification verification failed");
}

async function lookupTransactionInEnvironment({
  environment,
  logger,
  originalTransactionId,
  transactionId,
}: {
  environment: AppleEnvironment;
  logger: Logger;
} & AppleLookupReference) {
  const client = getAppleClient(environment);

  let baseTransaction: JWSTransactionDecodedPayload | null = null;
  let lookupOriginalTransactionId = originalTransactionId || null;

  if (transactionId) {
    const transactionInfo = await client.getTransactionInfo(transactionId);
    const signedTransactionInfo = transactionInfo.signedTransactionInfo;

    if (!signedTransactionInfo) {
      throw new Error(
        "Apple transaction lookup returned no signedTransactionInfo",
      );
    }

    baseTransaction = decodeSignedPayloadUnsafe<JWSTransactionDecodedPayload>(
      signedTransactionInfo,
    );
    lookupOriginalTransactionId =
      baseTransaction.originalTransactionId || originalTransactionId || null;
  }

  if (!lookupOriginalTransactionId) {
    throw new Error(
      "Apple lookup requires a transactionId or originalTransactionId",
    );
  }

  const statusResponse = await client.getAllSubscriptionStatuses(
    lookupOriginalTransactionId,
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
              originalTransactionId: lookupOriginalTransactionId,
              transactionId,
            });
            return null;
          }
        })
        .filter((value): value is NonNullable<typeof value> => Boolean(value)),
    ) || [];

  if (!candidates.length && !baseTransaction) {
    throw new Error("Apple subscription lookup returned no transactions");
  }

  const matchingCandidates = candidates.filter(
    (candidate) =>
      candidate.originalTransactionId === lookupOriginalTransactionId,
  );

  const chosenCandidate = (
    matchingCandidates.length ? matchingCandidates : candidates
  )
    .slice()
    .sort(sortAppleStatusCandidates)[0];

  const selectedTransaction = chosenCandidate?.decoded || baseTransaction;
  const selectedItem = chosenCandidate?.item;

  if (!selectedTransaction) {
    throw new Error(
      "Apple subscription lookup failed to resolve a transaction",
    );
  }

  const resolvedOriginalTransactionId =
    selectedTransaction.originalTransactionId || lookupOriginalTransactionId;
  const resolvedProductId = selectedTransaction.productId || "";

  return {
    appAccountToken: selectedTransaction.appAccountToken || null,
    environment,
    expiresAt: toDate(selectedTransaction.expiresDate),
    latestTransactionId:
      selectedTransaction.transactionId || transactionId || null,
    originalTransactionId: resolvedOriginalTransactionId,
    productId: resolvedProductId,
    purchaseDate: toDate(selectedTransaction.purchaseDate),
    revokedAt: toDate(selectedTransaction.revocationDate),
    status:
      getAppleStatusName(selectedItem?.status) ||
      deriveFallbackAppleStatus(selectedTransaction),
    subscriptionGroupIdentifier:
      selectedTransaction.subscriptionGroupIdentifier || null,
    tier: resolvedProductId
      ? getAppleSubscriptionTier({ productId: resolvedProductId })
      : null,
  } satisfies AppleSubscriptionState;
}

export async function getAppleSubscriptionState({
  environmentHint,
  logger,
  originalTransactionId,
  transactionId,
}: {
  environmentHint?: string | null;
  logger: Logger;
} & AppleLookupReference) {
  let lastError: unknown;

  for (const environment of getLookupEnvironments(environmentHint)) {
    try {
      const result = await lookupTransactionInEnvironment({
        environment,
        logger,
        originalTransactionId,
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
        originalTransactionId,
        transactionId,
      });

      if (!isRetryableAppleLookupError(error)) {
        break;
      }
    }
  }

  captureException(lastError, {
    extra: { originalTransactionId, transactionId },
  });
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
    existingPremium?.id &&
    authenticatedUserId &&
    !existingUserIds.includes(authenticatedUserId)
  ) {
    throw new SafeError("Apple purchase belongs to a different user");
  }

  if (existingPremium?.id) {
    return { premiumId: existingPremium.id, userIds: existingUserIds };
  }

  const ownerUserId = authenticatedUserId || null;

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
  originalTransactionId,
  transactionId,
}: {
  authenticatedUserId?: string;
  environmentHint?: string | null;
  logger: Logger;
} & AppleLookupReference) {
  const state = await getAppleSubscriptionState({
    environmentHint,
    logger,
    originalTransactionId,
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
      emailAccountsAccess: true,
      tier: true,
      users: { select: { id: true } },
    },
  });

  const resolvedTier =
    previousPremium?.tier && isOnHigherTier(previousPremium.tier, state.tier)
      ? previousPremium.tier
      : state.tier;
  const resolvedEmailAccountsAccess = Math.max(
    previousPremium?.emailAccountsAccess ?? 0,
    1,
  );

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
      emailAccountsAccess: resolvedEmailAccountsAccess,
      tier: resolvedTier,
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
      previousPremium?.tier !== resolvedTier ||
      previousPremium?.emailAccountsAccess !== resolvedEmailAccountsAccess;

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
