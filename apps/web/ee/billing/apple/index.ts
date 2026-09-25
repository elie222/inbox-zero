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
import { trackServerConversionEvent } from "@/utils/analytics/server-conversion-events";
import {
  isAppleLocalTestingEnabled,
  verifyLocalAppleNotification,
  verifyLocalAppleTransaction,
} from "./local-testing";
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
  currency: string | null;
  environment: AppleEnvironment;
  expiresAt: Date | null;
  latestTransactionId: string | null;
  originalTransactionId: string;
  offerDiscountType: string | null;
  price: number | null;
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
    throw new SafeError("Apple IAP server configuration is incomplete", 503);
  }
}

function assertAppleVerificationConfig(environment: AppleEnvironment) {
  if (!env.APPLE_IAP_BUNDLE_ID) {
    throw new SafeError("Apple IAP server configuration is incomplete", 503);
  }

  if (environment === Environment.PRODUCTION && !env.APPLE_IAP_APPLE_ID) {
    throw new SafeError("Apple IAP server configuration is incomplete", 503);
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
  let environments: AppleEnvironment[];

  if (normalized === Environment.PRODUCTION) {
    environments = [Environment.PRODUCTION, Environment.SANDBOX];
  } else if (normalized === Environment.SANDBOX) {
    environments = [Environment.SANDBOX, Environment.PRODUCTION];
  } else {
    environments = [Environment.PRODUCTION, Environment.SANDBOX];
  }

  return environments.filter(isAppleEnvironmentAllowed);
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

function stateFromDecodedTransaction({
  environment,
  fallbackOriginalTransactionId,
  status,
  transaction,
  transactionId,
}: {
  environment: AppleEnvironment;
  fallbackOriginalTransactionId?: string | null;
  status?: string | null;
  transaction: JWSTransactionDecodedPayload;
  transactionId?: string | null;
}): AppleSubscriptionState {
  const productId = transaction.productId || "";
  const originalTransactionId =
    transaction.originalTransactionId ||
    fallbackOriginalTransactionId ||
    transaction.transactionId ||
    "";
  if (!originalTransactionId) {
    throw new SafeError("Apple transaction has no originalTransactionId");
  }

  return {
    appAccountToken: transaction.appAccountToken || null,
    currency: transaction.currency || null,
    environment,
    expiresAt: toDate(transaction.expiresDate),
    latestTransactionId:
      transaction.transactionId || transactionId || originalTransactionId,
    originalTransactionId,
    offerDiscountType: transaction.offerDiscountType || null,
    price: transaction.price ?? null,
    productId,
    purchaseDate: toDate(transaction.purchaseDate),
    revokedAt: toDate(transaction.revocationDate),
    status: status || deriveFallbackAppleStatus(transaction),
    subscriptionGroupIdentifier:
      transaction.subscriptionGroupIdentifier || null,
    tier: productId ? getAppleSubscriptionTier({ productId }) : null,
  };
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
  if (isAppleLocalTestingEnabled()) {
    const local = await verifyLocalAppleNotification(signedPayload);
    if (local?.transaction) {
      return {
        environment: Environment.SANDBOX,
        notification:
          local.notification as unknown as ResponseBodyV2DecodedPayload,
        renewalInfo: null,
        transaction: local.transaction as JWSTransactionDecodedPayload,
      } satisfies AppleVerifiedNotification;
    }
  }

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

  return stateFromDecodedTransaction({
    environment,
    fallbackOriginalTransactionId: lookupOriginalTransactionId,
    status:
      getAppleStatusName(selectedItem?.status) ||
      deriveFallbackAppleStatus(selectedTransaction),
    transaction: selectedTransaction,
    transactionId,
  });
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

export async function verifyAppleSignedTransaction(signedTransaction: string) {
  if (isAppleLocalTestingEnabled()) {
    const local = await verifyLocalAppleTransaction(signedTransaction);
    if (!local) throw new SafeError("Invalid Apple signed transaction");
    return local as JWSTransactionDecodedPayload;
  }

  let lastError: unknown;
  for (const environment of getLookupEnvironments()) {
    try {
      return await getAppleVerifier(environment).verifyAndDecodeTransaction(
        signedTransaction,
      );
    } catch (error) {
      lastError = error;
      if (!isRetryableAppleVerificationError(error)) break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new SafeError("Invalid Apple signed transaction");
}

export async function syncAppleSubscriptionToDb({
  authenticatedUserId,
  environmentHint,
  logger,
  originalTransactionId,
  transactionId,
  verifiedTransaction,
}: {
  authenticatedUserId?: string;
  environmentHint?: string | null;
  logger: Logger;
  verifiedTransaction?: JWSTransactionDecodedPayload | null;
} & AppleLookupReference) {
  const verifiedEnvironment = verifiedTransaction
    ? normalizeAppleEnvironment(
        verifiedTransaction.environment || environmentHint,
      )
    : null;
  const state = verifiedTransaction
    ? stateFromDecodedTransaction({
        environment: verifiedEnvironment ?? Environment.SANDBOX,
        transaction: verifiedTransaction,
        transactionId,
      })
    : await getAppleSubscriptionState({
        environmentHint,
        logger,
        originalTransactionId,
        transactionId,
      });

  if (!isAppleEnvironmentAllowed(state.environment)) {
    throw new SafeError(
      "Sandbox Apple subscriptions cannot grant production access",
    );
  }

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
      appleOfferDiscountType: true,
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
      appleOfferDiscountType: state.offerDiscountType,
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
      appleOfferDiscountType: true,
      appleRevokedAt: true,
      appleSubscriptionStatus: true,
      tier: true,
      users: { select: { id: true } },
    },
  });

  after(async () => {
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

    await Promise.all(
      updatedPremium.users.map((user) =>
        trackServerConversionEvent({
          name: "apple_subscription_synced",
          id: `${state.latestTransactionId || state.originalTransactionId}:${user.id}`,
          timestamp: state.purchaseDate ?? new Date(),
          userId: user.id,
          properties: {
            planId: state.productId,
            amount:
              typeof state.price === "number" ? state.price / 1000 : undefined,
            currency: state.currency ?? undefined,
            currentOfferDiscountType: state.offerDiscountType,
            currentSubscriptionStatus: state.status,
            environment: state.environment,
            originalTransactionId: state.originalTransactionId,
            previousOfferDiscountType:
              previousPremium?.appleOfferDiscountType ?? null,
            previousSubscriptionStatus:
              previousPremium?.appleSubscriptionStatus ?? null,
          },
          logger,
        }),
      ),
    );
  });

  return updatedPremium;
}

function isAppleEnvironmentAllowed(environment: AppleEnvironment) {
  return (
    env.NODE_ENV !== "production" || environment === Environment.PRODUCTION
  );
}
