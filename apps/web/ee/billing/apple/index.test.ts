import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APIError,
  APIException,
  VerificationException,
  VerificationStatus,
} from "@apple/app-store-server-library";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { signLocalAppleTransaction } from "./local-testing";
import {
  getAppleSubscriptionState,
  syncAppleSubscriptionToDb,
  verifyAppleNotificationPayload,
  verifyAppleSignedTransaction,
} from "./index";

const mocks = vi.hoisted(() => ({
  productionClient: {
    getAllSubscriptionStatuses: vi.fn(),
    getTransactionInfo: vi.fn(),
  },
  sandboxClient: {
    getAllSubscriptionStatuses: vi.fn(),
    getTransactionInfo: vi.fn(),
  },
  productionVerifier: {
    verifyAndDecodeNotification: vi.fn(),
    verifyAndDecodeRenewalInfo: vi.fn(),
    verifyAndDecodeTransaction: vi.fn(),
  },
  sandboxVerifier: {
    verifyAndDecodeNotification: vi.fn(),
    verifyAndDecodeRenewalInfo: vi.fn(),
    verifyAndDecodeTransaction: vi.fn(),
  },
}));

vi.mock("@/env", () => ({
  env: {
    APPLE_IAP_APPLE_ID: 123_456_789,
    APPLE_IAP_BUNDLE_ID: "com.example.app",
    APPLE_IAP_ISSUER_ID: "issuer-id",
    APPLE_IAP_KEY_ID: "key-id",
    APPLE_IAP_PRIVATE_KEY: "private-key",
    APPLE_IAP_LOCAL_TESTING: false,
    NODE_ENV: "test",
  },
}));
vi.mock("next/server", () => ({
  after: vi.fn(),
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/error", () => ({
  SafeError: class SafeError extends Error {},
  captureException: vi.fn(),
}));
vi.mock("@apple/app-store-server-library", () => {
  const Environment = {
    LOCAL_TESTING: "LocalTesting",
    PRODUCTION: "Production",
    SANDBOX: "Sandbox",
    XCODE: "Xcode",
  };

  class APIException extends Error {
    httpStatusCode: number;
    apiError: number;
    errorMessage: string | null;

    constructor(
      httpStatusCode: number,
      apiError = 0,
      errorMessage: string | null = null,
    ) {
      super("Apple API error");
      this.httpStatusCode = httpStatusCode;
      this.apiError = apiError;
      this.errorMessage = errorMessage;
    }
  }

  class VerificationException extends Error {
    status: number;

    constructor(status: number) {
      super("Apple verification error");
      this.status = status;
    }
  }

  return {
    APIError: {
      INVALID_ORIGINAL_TRANSACTION_ID: 4,
      INVALID_TRANSACTION_ID: 3,
    },
    APIException,
    AppStoreServerAPIClient: vi.fn(
      class AppStoreServerAPIClient {
        getAllSubscriptionStatuses: ReturnType<typeof vi.fn>;
        getTransactionInfo: ReturnType<typeof vi.fn>;

        constructor(
          _privateKey: string,
          _keyId: string,
          _issuerId: string,
          _bundleId: string,
          environment: string,
        ) {
          const client =
            environment === Environment.PRODUCTION
              ? mocks.productionClient
              : mocks.sandboxClient;
          this.getAllSubscriptionStatuses = client.getAllSubscriptionStatuses;
          this.getTransactionInfo = client.getTransactionInfo;
        }
      },
    ),
    Environment,
    SignedDataVerifier: vi.fn(
      class SignedDataVerifier {
        verifyAndDecodeNotification: ReturnType<typeof vi.fn>;
        verifyAndDecodeRenewalInfo: ReturnType<typeof vi.fn>;
        verifyAndDecodeTransaction: ReturnType<typeof vi.fn>;

        constructor(
          _appleRootCertificates: Buffer[],
          _enableOnlineChecks: boolean,
          environment: string,
        ) {
          const verifier =
            environment === Environment.PRODUCTION
              ? mocks.productionVerifier
              : mocks.sandboxVerifier;
          this.verifyAndDecodeNotification =
            verifier.verifyAndDecodeNotification;
          this.verifyAndDecodeRenewalInfo = verifier.verifyAndDecodeRenewalInfo;
          this.verifyAndDecodeTransaction = verifier.verifyAndDecodeTransaction;
        }
      },
    ),
    Status: { 1: "ACTIVE" },
    VerificationException,
    VerificationStatus: {
      INVALID_APP_IDENTIFIER: 3,
      INVALID_ENVIRONMENT: 4,
    },
  };
});

describe("getAppleSubscriptionState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.NODE_ENV = "test";
    mocks.productionClient.getTransactionInfo.mockRejectedValue(
      new Error("Production transaction not found"),
    );
    mockSuccessfulSandboxLookup();
  });

  it("does not look up sandbox transactions in production", async () => {
    env.NODE_ENV = "production";

    await expect(
      getAppleSubscriptionState({
        environmentHint: "Sandbox",
        logger: testLogger,
        transactionId: "sandbox-transaction",
      }),
    ).rejects.toThrow("Production transaction not found");

    expect(mocks.productionClient.getTransactionInfo).toHaveBeenCalledWith(
      "sandbox-transaction",
    );
    expect(mocks.sandboxClient.getTransactionInfo).not.toHaveBeenCalled();
  });

  it("allows sandbox transaction lookup outside production", async () => {
    const state = await getAppleSubscriptionState({
      environmentHint: "Sandbox",
      logger: testLogger,
      transactionId: "sandbox-transaction",
    });

    expect(state.environment).toBe("Sandbox");
    expect(state.originalTransactionId).toBe("original-transaction");
    expect(mocks.sandboxClient.getTransactionInfo).toHaveBeenCalledWith(
      "sandbox-transaction",
    );
    expect(mocks.productionClient.getTransactionInfo).not.toHaveBeenCalled();
  });

  it("does not fall back to sandbox transactions in production", async () => {
    env.NODE_ENV = "production";
    const productionError = new APIException(
      404,
      APIError.INVALID_TRANSACTION_ID,
    );
    mocks.productionClient.getTransactionInfo.mockRejectedValue(
      productionError,
    );

    await expect(
      getAppleSubscriptionState({
        logger: testLogger,
        transactionId: "sandbox-transaction",
      }),
    ).rejects.toBe(productionError);

    expect(mocks.sandboxClient.getTransactionInfo).not.toHaveBeenCalled();
  });
});

describe("verifyAppleNotificationPayload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.NODE_ENV = "test";
    mocks.productionVerifier.verifyAndDecodeNotification.mockRejectedValue(
      new VerificationException(VerificationStatus.INVALID_ENVIRONMENT),
    );
    mocks.sandboxVerifier.verifyAndDecodeNotification.mockResolvedValue({
      notificationType: "TEST",
    });
  });

  it("does not verify sandbox notifications in production", async () => {
    env.NODE_ENV = "production";

    await expect(
      verifyAppleNotificationPayload("sandbox-payload"),
    ).rejects.toThrow("Apple verification error");

    expect(
      mocks.productionVerifier.verifyAndDecodeNotification,
    ).toHaveBeenCalledWith("sandbox-payload");
    expect(
      mocks.sandboxVerifier.verifyAndDecodeNotification,
    ).not.toHaveBeenCalled();
  });

  it("allows sandbox notification verification outside production", async () => {
    const result = await verifyAppleNotificationPayload("sandbox-payload");

    expect(result.environment).toBe("Sandbox");
    expect(
      mocks.sandboxVerifier.verifyAndDecodeNotification,
    ).toHaveBeenCalledWith("sandbox-payload");
  });
});

describe("local Apple signed transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.NODE_ENV = "test";
    env.APPLE_IAP_LOCAL_TESTING = true;
    prisma.premium.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ premiumId: "premium-1" });
    prisma.premium.findUnique.mockResolvedValue(null);
    prisma.premium.update.mockImplementation(async ({ data }) => ({
      id: "premium-1",
      users: [{ id: "user-1" }],
      ...data,
    }));
  });

  it("grants Starter from a locally signed StoreKit transaction", async () => {
    const signedTransaction = await signLocalAppleTransaction({
      currency: "USD",
      expiresDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      offerDiscountType: "FREE_TRIAL",
      originalTransactionId: "orig-1",
      price: 0,
      productId: "com.getinboxzero.starter.monthly.v2",
      purchaseDate: Date.now(),
      transactionId: "txn-1",
    });

    const verified = await verifyAppleSignedTransaction(signedTransaction);
    const premium = await syncAppleSubscriptionToDb({
      authenticatedUserId: "user-1",
      logger: testLogger,
      verifiedTransaction: verified,
    });

    expect(premium).toMatchObject({
      appleProductId: "com.getinboxzero.starter.monthly.v2",
      appleOfferDiscountType: "FREE_TRIAL",
      appleSubscriptionStatus: "ACTIVE",
      tier: "STARTER_MONTHLY",
    });
    expect(mocks.sandboxClient.getTransactionInfo).not.toHaveBeenCalled();
  });

  it("records a refund from the signed transaction", async () => {
    const signedTransaction = await signLocalAppleTransaction({
      expiresDate: Date.now() + 24 * 60 * 60 * 1000,
      originalTransactionId: "orig-1",
      productId: "com.getinboxzero.starter.annual.v2",
      revocationDate: Date.now(),
      transactionId: "txn-refund",
    });
    const verified = await verifyAppleSignedTransaction(signedTransaction);
    const premium = await syncAppleSubscriptionToDb({
      authenticatedUserId: "user-1",
      logger: testLogger,
      verifiedTransaction: verified,
    });

    expect(premium).toMatchObject({
      appleProductId: "com.getinboxzero.starter.annual.v2",
      appleSubscriptionStatus: "REVOKED",
      tier: "STARTER_ANNUALLY",
    });
    expect(premium?.appleRevokedAt).toBeInstanceOf(Date);
  });
});

function mockSuccessfulSandboxLookup() {
  const signedTransactionInfo = createSignedPayload({
    originalTransactionId: "original-transaction",
    productId: "product-id",
    transactionId: "sandbox-transaction",
  });

  mocks.sandboxClient.getTransactionInfo.mockResolvedValue({
    signedTransactionInfo,
  });
  mocks.sandboxClient.getAllSubscriptionStatuses.mockResolvedValue({
    data: [
      {
        lastTransactions: [
          {
            signedTransactionInfo,
            status: 1,
          },
        ],
      },
    ],
  });
}

function createSignedPayload(payload: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

const testLogger = {
  warn: vi.fn(),
} as never;
