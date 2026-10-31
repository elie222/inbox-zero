import {
  combineEmailHtml,
  prepareEmailDraft,
} from "@inboxzero/email-editor/core";
import { describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { buildDraftReplyBody } from "./reply-body";

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BRAND_NAME: "Inbox Zero",
    NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE: true,
  },
}));

describe("buildDraftReplyBody", () => {
  it("separates a provider-normalized HTML signature when reopening a draft", async () => {
    const signature =
      '<table role="presentation" cellspacing="0"><tbody><tr><td style="line-height:18px">Example Person</td></tr><tr><td>Senior Consultant</td></tr></tbody></table>';
    prisma.emailAccount.findUnique.mockResolvedValue({
      allowHiddenAiDraftLinks: false,
      includeReferralSignature: false,
      signature,
    } as never);

    const generatedBody = await buildDraftReplyBody({
      text: "Thanks for the update.",
      emailAccountId: "account",
      userId: "user",
    });
    const normalizedBody = generatedBody
      .replace('style="line-height:18px"', 'style="line-height: 18px"')
      .replace(' data-smartmail="gmail_signature"', "");
    const reopenedDraft = prepareEmailDraft({
      html: normalizedBody,
      signatureHtml: signature,
    });

    expect(reopenedDraft.editableHtml.trim()).toBe("Thanks for the update.");
    expect(reopenedDraft.signatureHtml).toContain("<table");
    expect(
      combineEmailHtml(reopenedDraft).match(/Example Person/gu),
    ).toHaveLength(1);
  });
});
