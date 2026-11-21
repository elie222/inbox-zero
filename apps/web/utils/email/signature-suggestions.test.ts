import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
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
            version: 1,
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
          version: 1,
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

  it.each([
    undefined,
    0,
  ])("rescans version %s once instead of reusing a legacy scan", async (version) => {
    const state: Record<string, unknown> = account({
      sentSignatureScan: { version, signatures: [], providerSignature: false },
      sentSignatureScannedAt: new Date(),
    });
    prisma.emailAccount.findUnique.mockImplementation(
      async () => state as never,
    );
    prisma.emailAccount.update.mockImplementation(async ({ data }) => {
      Object.assign(state, data);
      return state as never;
    });
    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getSendAsAddresses: vi.fn().mockResolvedValue([]),
        getSentMessages: vi
          .fn()
          .mockResolvedValue([sent(german), sent(german)]),
      }),
    );

    for (let request = 0; request < 2; request++) {
      expect(
        await getSignatureSuggestions({ emailAccountId: "account", logger }),
      ).toEqual({
        suggestions: [{ html: german, count: 2 }],
        needsDefault: false,
      });
    }
    expect(createEmailProvider).toHaveBeenCalledTimes(1);
  });

  it("filters saved signatures before limiting suggestions, including cached candidates", async () => {
    const saved = Array.from(
      { length: 5 },
      (_, index) => `<div>Saved ${index}</div>`,
    );
    const unsaved = Array.from(
      { length: 6 },
      (_, index) => `<div>Unsaved ${index}</div>`,
    );
    const state: Record<string, unknown> = account({
      emailSignatures: saved.map((html) => ({ html })),
    });
    prisma.emailAccount.findUnique.mockImplementation(
      async () => state as never,
    );
    prisma.emailAccount.update.mockImplementation(async ({ data }) => {
      Object.assign(state, data);
      return state as never;
    });
    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getSendAsAddresses: vi.fn().mockResolvedValue([]),
        getSentMessages: vi
          .fn()
          .mockResolvedValue([
            ...saved.flatMap((html) => [sent(html), sent(html), sent(html)]),
            ...unsaved.flatMap((html) => [sent(html), sent(html)]),
          ]),
      }),
    );

    for (let request = 0; request < 2; request++) {
      expect(
        await getSignatureSuggestions({ emailAccountId: "account", logger }),
      ).toEqual({
        suggestions: unsaved.slice(0, 5).map((html) => ({ html, count: 2 })),
        needsDefault: false,
      });
    }
    state.emailSignatures = [];
    expect(
      (await getSignatureSuggestions({ emailAccountId: "account", logger }))
        .suggestions,
    ).toEqual(saved.map((html) => ({ html, count: 3 })));
    expect(createEmailProvider).toHaveBeenCalledTimes(1);
  });

  it("asks for a default when the account sends with no signature set", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      account({
        signature: null,
        account: { provider: "microsoft" },
        sentSignatureScan: {
          version: 1,
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

  it.each([
    { elapsed: 0, retries: false },
    { elapsed: 60 * 60 * 1000, retries: true },
  ])("retries=$retries a failed scan after $elapsed ms", async ({
    elapsed,
    retries,
  }) => {
    vi.useFakeTimers();
    const state: Record<string, unknown> = account();
    prisma.emailAccount.findUnique.mockImplementation(
      async () => state as never,
    );
    prisma.emailAccount.update.mockImplementation(async ({ data }) => {
      Object.assign(state, data);
      return state as never;
    });
    vi.mocked(createEmailProvider)
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue(
        createMockEmailProvider({
          getSendAsAddresses: vi.fn().mockResolvedValue([]),
          getSentMessages: vi
            .fn()
            .mockResolvedValue([sent(german), sent(german)]),
        }),
      );

    expect(
      await getSignatureSuggestions({ emailAccountId: "account", logger }),
    ).toEqual({ suggestions: [], needsDefault: false });
    await vi.advanceTimersByTimeAsync(elapsed);
    expect(
      await getSignatureSuggestions({ emailAccountId: "account", logger }),
    ).toEqual({
      suggestions: retries ? [{ html: german, count: 2 }] : [],
      needsDefault: false,
    });
    expect(createEmailProvider).toHaveBeenCalledTimes(retries ? 2 : 1);
  });

  it("suggests a deleted saved signature from the cached scan", async () => {
    const state: Record<string, unknown> = account({
      emailSignatures: [{ html: german }],
    });
    prisma.emailAccount.findUnique.mockImplementation(
      async () => state as never,
    );
    prisma.emailAccount.update.mockImplementation(async ({ data }) => {
      Object.assign(state, data);
      return state as never;
    });
    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getSendAsAddresses: vi.fn().mockResolvedValue([]),
        getSentMessages: vi
          .fn()
          .mockResolvedValue([sent(german), sent(german)]),
      }),
    );

    expect(
      await getSignatureSuggestions({ emailAccountId: "account", logger }),
    ).toEqual({ suggestions: [], needsDefault: false });
    state.emailSignatures = [];
    expect(
      await getSignatureSuggestions({ emailAccountId: "account", logger }),
    ).toEqual({
      suggestions: [{ html: german, count: 2 }],
      needsDefault: false,
    });
    expect(createEmailProvider).toHaveBeenCalledTimes(1);
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
