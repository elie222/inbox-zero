import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { createEmailProvider } from "@/utils/email/provider";
import { createScopedLogger } from "@/utils/logger";
import { getSignatureSuggestions } from "./signature-suggestions";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));

const logger = createScopedLogger("signature-suggestions-test");
const english = "<div>Best,<br>Ada</div>";
const german = "<div>Viele Grüße,<br>Ada</div>";

function sent(signature: string) {
  return {
    textHtml: `<div>Hi</div><div class="gmail_signature">${signature}</div>`,
  };
}

function account(overrides: Record<string, unknown> = {}) {
  return {
    signature: english,
    sentSignatureScan: null,
    sentSignatureScannedAt: null,
    account: { provider: "google" },
    emailSignatures: [],
    user: { dismissedHints: [] },
    ...overrides,
  } as never;
}

describe("getSignatureSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scans sent mail once and suggests a signature used more than once", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getSendAsAddresses: vi
          .fn()
          .mockResolvedValue([
            { email: "ada@example.com", isDefault: true, signature: english },
          ]),
        getSentMessages: vi
          .fn()
          .mockResolvedValue([
            sent(english),
            sent(german),
            sent(german),
            sent("<div>Thanks!</div>"),
          ]),
      }),
    );
    prisma.emailAccount.findUnique.mockResolvedValue(account());

    const result = await getSignatureSuggestions({
      emailAccountId: "account",
      logger,
    });

    expect(result).toEqual({
      suggestions: [{ html: german, count: 2 }],
      needsDefault: false,
    });
    expect(prisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sentSignatureScan: {
            signatures: [
              { html: german, count: 2 },
              { html: "<div>Thanks!</div>", count: 1 },
            ],
            providerSignature: true,
          },
        }),
      }),
    );
  });

  it("uses the stored scan and leaves out signatures saved since", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      account({
        sentSignatureScan: {
          signatures: [{ html: german, count: 3 }],
          providerSignature: true,
        },
        sentSignatureScannedAt: new Date(),
        emailSignatures: [{ html: german }],
      }),
    );

    expect(
      await getSignatureSuggestions({ emailAccountId: "account", logger }),
    ).toEqual({ suggestions: [], needsDefault: false });
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("asks for a default when the account sends with no signature set", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      account({
        signature: null,
        account: { provider: "microsoft" },
        sentSignatureScan: {
          signatures: [{ html: english, count: 4 }],
          providerSignature: false,
        },
        sentSignatureScannedAt: new Date(),
      }),
    );

    expect(
      await getSignatureSuggestions({ emailAccountId: "account", logger }),
    ).toEqual({
      suggestions: [{ html: english, count: 4 }],
      needsDefault: true,
    });
  });

  it("suggests nothing once dismissed for the account", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      account({
        user: { dismissedHints: ["signature-suggestions:account"] },
      }),
    );

    expect(
      await getSignatureSuggestions({ emailAccountId: "account", logger }),
    ).toEqual({ suggestions: [], needsDefault: false });
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("stores an empty scan when the mailbox can't be read", async () => {
    vi.mocked(createEmailProvider).mockRejectedValue(new Error("expired"));
    prisma.emailAccount.findUnique.mockResolvedValue(account());

    expect(
      await getSignatureSuggestions({ emailAccountId: "account", logger }),
    ).toEqual({ suggestions: [], needsDefault: false });
    expect(prisma.emailAccount.update).toHaveBeenCalled();
  });

  it("still scans sent mail when the provider signature can't be read, without claiming none", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getSendAsAddresses: vi.fn().mockRejectedValue(new Error("forbidden")),
        getSentMessages: vi
          .fn()
          .mockResolvedValue([sent(german), sent(german)]),
      }),
    );
    prisma.emailAccount.findUnique.mockResolvedValue(
      account({ signature: null }),
    );

    const result = await getSignatureSuggestions({
      emailAccountId: "account",
      logger,
    });

    expect(result).toEqual({
      suggestions: [{ html: german, count: 2 }],
      needsDefault: false,
    });
  });
});
