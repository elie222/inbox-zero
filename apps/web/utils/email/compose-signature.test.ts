import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { createEmailProvider } from "@/utils/email/provider";
import { createScopedLogger } from "@/utils/logger";
import { getOrCreateReferralCode } from "@/utils/referral/referral-code";
import { getComposeSignature } from "./compose-signature";

const mockedEnv = vi.hoisted(() => ({
  NEXT_PUBLIC_BASE_URL: "https://app.example.com",
  NEXT_PUBLIC_BRAND_NAME: "Inbox Zero",
  NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE: false as boolean | undefined,
}));

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({ env: mockedEnv }));
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/referral/referral-code", () => ({
  getOrCreateReferralCode: vi.fn(),
}));

const logger = createScopedLogger("compose-signature-test");

describe("getComposeSignature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getSendAsAddresses: vi.fn().mockResolvedValue([]),
      }),
    );
    mockedEnv.NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE = false;
    vi.mocked(getOrCreateReferralCode).mockResolvedValue({ code: "abc123" });
  });

  it("returns the account signature and a footer with the referral link", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      signature: "<div>Example Person</div>",
      includeSentWithSignature: true,
      account: { provider: "google" },
      emailSignatures: [],
    } as never);

    expect(
      await getComposeSignature({
        emailAccountId: "account",
        userId: "user",
        logger,
      }),
    ).toEqual({
      signatureHtml: "<div>Example Person</div>",
      footerHtml:
        '<div>Sent with <a href="https://app.example.com/?ref=abc123">Inbox Zero</a></div>',
      signatures: [
        {
          id: "default",
          name: "Default",
          signatureHtml: "<div>Example Person</div>",
        },
      ],
    });
  });

  it("lists the default signature first, then the account's named signatures", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      signature: "<div>Best, Ada</div>",
      includeSentWithSignature: false,
      account: { provider: "google" },
      emailSignatures: [
        { id: "sig-de", name: "German", html: "<div>Viele Grüße, Ada</div>" },
      ],
    } as never);

    expect(
      (
        await getComposeSignature({
          emailAccountId: "account",
          userId: "user",
          logger,
        })
      ).signatures,
    ).toEqual([
      { id: "default", name: "Default", signatureHtml: "<div>Best, Ada</div>" },
      {
        id: "sig-de",
        name: "German",
        signatureHtml: "<div>Viele Grüße, Ada</div>",
      },
    ]);
  });

  it("signs with the provider's default signature when none is saved", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getSendAsAddresses: vi.fn().mockResolvedValue([
          { email: "alias@example.com", isDefault: false, signature: "Alias" },
          {
            email: "ada@example.com",
            isDefault: true,
            signature: "<div>Ada from Gmail</div>",
          },
        ]),
      }),
    );
    prisma.emailAccount.findUnique.mockResolvedValue({
      signature: null,
      includeSentWithSignature: false,
      account: { provider: "google" },
      emailSignatures: [],
    } as never);

    const result = await getComposeSignature({
      emailAccountId: "account",
      userId: "user",
      logger,
    });

    expect(result.signatureHtml).toBe("<div>Ada from Gmail</div>");
    expect(result.signatures).toEqual([
      {
        id: "default",
        name: "Default",
        signatureHtml: "<div>Ada from Gmail</div>",
      },
    ]);
  });

  it("still answers without a signature when the provider lookup fails", async () => {
    vi.mocked(createEmailProvider).mockRejectedValue(new Error("expired"));
    prisma.emailAccount.findUnique.mockResolvedValue({
      signature: null,
      includeSentWithSignature: false,
      account: { provider: "google" },
      emailSignatures: [],
    } as never);

    expect(
      await getComposeSignature({
        emailAccountId: "account",
        userId: "user",
        logger,
      }),
    ).toEqual({ signatureHtml: "", footerHtml: "", signatures: [] });
  });

  it("stops waiting for a provider that never answers", async () => {
    vi.useFakeTimers();
    vi.mocked(createEmailProvider).mockReturnValue(new Promise(() => {}));
    prisma.emailAccount.findUnique.mockResolvedValue({
      signature: null,
      includeSentWithSignature: false,
      account: { provider: "google" },
      emailSignatures: [],
    } as never);

    const result = getComposeSignature({
      emailAccountId: "account",
      userId: "user",
      logger,
    });
    await vi.advanceTimersByTimeAsync(5000);

    expect(await result).toEqual({
      signatureHtml: "",
      footerHtml: "",
      signatures: [],
    });
    vi.useRealTimers();
  });

  it("leaves the footer out when the account or the deployment turns it off", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      signature: null,
      includeSentWithSignature: false,
      account: { provider: "google" },
      emailSignatures: [],
    } as never);
    expect(
      await getComposeSignature({
        emailAccountId: "account",
        userId: "user",
        logger,
      }),
    ).toEqual({ signatureHtml: "", footerHtml: "", signatures: [] });

    mockedEnv.NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE = true;
    prisma.emailAccount.findUnique.mockResolvedValue({
      signature: null,
      includeSentWithSignature: true,
      account: { provider: "google" },
      emailSignatures: [],
    } as never);
    expect(
      (
        await getComposeSignature({
          emailAccountId: "account",
          userId: "user",
          logger,
        })
      ).footerHtml,
    ).toBe("");
  });

  it("still adds the footer when the referral lookup fails", async () => {
    vi.mocked(getOrCreateReferralCode).mockRejectedValue(new Error("down"));
    prisma.emailAccount.findUnique.mockResolvedValue({
      signature: null,
      includeSentWithSignature: true,
      account: { provider: "google" },
      emailSignatures: [],
    } as never);

    expect(
      (
        await getComposeSignature({
          emailAccountId: "account",
          userId: "user",
          logger,
        })
      ).footerHtml,
    ).toBe(
      '<div>Sent with <a href="https://app.example.com">Inbox Zero</a></div>',
    );
  });
});
