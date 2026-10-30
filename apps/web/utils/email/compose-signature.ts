import { env } from "@/env";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { DEFAULT_SIGNATURE_ID } from "@/utils/email/default-signature";
import { renderSentWithFooterHtml } from "@/utils/email/sent-with-footer";
import { getOrCreateReferralCode } from "@/utils/referral/referral-code";
import { generateReferralLink } from "@/utils/referral/referral-link";

/**
 * The signature and "Sent with" footer every composer adds to a new message,
 * so web and the mobile apps send the same thing, plus every signature the
 * composer can switch to, the account's default first.
 */
export async function getComposeSignature({
  emailAccountId,
  userId,
}: {
  emailAccountId: string;
  userId: string;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      signature: true,
      includeSentWithSignature: true,
      emailSignatures: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, html: true },
      },
    },
  });
  if (!emailAccount) throw new SafeError("Email account not found");

  const signatureHtml = emailAccount.signature ?? "";
  const signatures = emailAccount.emailSignatures.map(({ id, name, html }) => ({
    id,
    name,
    signatureHtml: html,
  }));
  if (signatureHtml.trim())
    signatures.unshift({
      id: DEFAULT_SIGNATURE_ID,
      name: "Default",
      signatureHtml,
    });

  const includeFooter =
    !env.NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE &&
    emailAccount.includeSentWithSignature;
  return {
    signatureHtml,
    footerHtml: includeFooter
      ? renderSentWithFooterHtml(await getFooterLink(userId))
      : "",
    signatures,
  };
}

// A failed referral lookup still sends the footer, just without the referral link.
async function getFooterLink(userId: string) {
  try {
    const { code } = await getOrCreateReferralCode(userId);
    return generateReferralLink(code);
  } catch {
    return env.NEXT_PUBLIC_BASE_URL;
  }
}
