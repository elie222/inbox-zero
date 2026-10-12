import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getOrCreateReferralCode } from "@/utils/referral/referral-code";
import { getComposeSignature } from "./compose-signature";

const mockedEnv = vi.hoisted(() => ({
  NEXT_PUBLIC_BASE_URL: "https://app.example.com",
  NEXT_PUBLIC_BRAND_NAME: "Inbox Zero",
  NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE: false as boolean | undefined,
}));

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({ env: mockedEnv }));
vi.mock("@/utils/referral/referral-code", () => ({
  getOrCreateReferralCode: vi.fn(),
}));

describe("getComposeSignature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnv.NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE = false;
    vi.mocked(getOrCreateReferralCode).mockResolvedValue({ code: "abc123" });
  });

  it("returns the account signature and a footer with the referral link", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      signature: "<div>Example Person</div>",
      includeSentWithSignature: true,
    } as never);

    expect(
      await getComposeSignature({ emailAccountId: "account", userId: "user" }),
    ).toEqual({
      signatureHtml: "<div>Example Person</div>",
      footerHtml:
        '<div>Sent with <a href="https://app.example.com/?ref=abc123">Inbox Zero</a></div>',
    });
  });

  it("leaves the footer out when the account or the deployment turns it off", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      signature: null,
      includeSentWithSignature: false,
    } as never);
    expect(
      await getComposeSignature({ emailAccountId: "account", userId: "user" }),
    ).toEqual({ signatureHtml: "", footerHtml: "" });

    mockedEnv.NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE = true;
    prisma.emailAccount.findUnique.mockResolvedValue({
      signature: null,
      includeSentWithSignature: true,
    } as never);
    expect(
      (await getComposeSignature({ emailAccountId: "account", userId: "user" }))
        .footerHtml,
    ).toBe("");
  });

  it("still adds the footer when the referral lookup fails", async () => {
    vi.mocked(getOrCreateReferralCode).mockRejectedValue(new Error("down"));
    prisma.emailAccount.findUnique.mockResolvedValue({
      signature: null,
      includeSentWithSignature: true,
    } as never);

    expect(
      (await getComposeSignature({ emailAccountId: "account", userId: "user" }))
        .footerHtml,
    ).toBe(
      '<div>Sent with <a href="https://app.example.com">Inbox Zero</a></div>',
    );
  });
});
