import { describe, expect, it, vi } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import prisma from "@/utils/__mocks__/prisma";
import { findSentSignaturesAction } from "@/utils/actions/signature";
import { createEmailProvider } from "@/utils/email/provider";
import { findSentSignatures } from "@/utils/email/sent-signatures";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

describe("findSentSignaturesAction", () => {
  it("returns the five most used unsaved signatures while leaving the raw scan uncapped", async () => {
    const candidates = Array.from({ length: 7 }, (_, index) => ({
      html: `<div>Signature ${index}</div>`,
      count: index + 1,
    }));
    const emailProvider = createMockEmailProvider({
      getSentMessages: vi.fn().mockResolvedValue(
        candidates.flatMap(({ html, count }) =>
          Array.from({ length: count }, () =>
            getMockMessage({
              textHtml: `<p>Hello</p><div class="gmail_signature">${html}</div>`,
            }),
          ),
        ),
      ),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(emailProvider);
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: { userId: "user-1", provider: "google" },
      signature: candidates[6].html,
      emailSignatures: [],
    } as never);

    const result = await findSentSignaturesAction("account-1");

    expect(result?.data).toEqual({
      signatures: candidates.slice(1, 6).reverse(),
    });
    expect(
      await findSentSignatures({ emailProvider, knownSignatures: [] }),
    ).toEqual([...candidates].reverse());
  });
});
