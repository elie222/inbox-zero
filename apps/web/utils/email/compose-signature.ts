import { env } from "@/env";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { DEFAULT_SIGNATURE_ID } from "@/utils/email/default-signature";
import { createEmailProvider } from "@/utils/email/provider";
import { renderSentWithFooterHtml } from "@/utils/email/sent-with-footer";
import { getOrCreateReferralCode } from "@/utils/referral/referral-code";
import { generateReferralLink } from "@/utils/referral/referral-link";
import type { Logger } from "@/utils/logger";

/**
 * The signature and "Sent with" footer every composer adds to a new message,
 * so web and the mobile apps send the same thing, plus every signature the
 * composer can switch to, the account's default first.
 */
export async function getComposeSignature({
  emailAccountId,
  userId,
  logger,
}: {
  emailAccountId: string;
  userId: string;
  logger: Logger;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      signature: true,
      includeSentWithSignature: true,
      account: { select: { provider: true } },
      emailSignatures: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, html: true },
      },
    },
  });
  if (!emailAccount) throw new SafeError("Email account not found");

  const signatureHtml =
    emailAccount.signature ||
    (await getProviderDefaultSignature({
      emailAccountId,
      provider: emailAccount.account.provider,
      logger,
    }));
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

const PROVIDER_SIGNATURE_TIMEOUT_MS = 5000;

// Mail sent through the API gets no signature from the provider, so an account
// that never saved one in Inbox Zero signs with the one set in Gmail.
async function getProviderDefaultSignature({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => {
      logger.warn("Timed out loading the provider signature");
      resolve("");
    }, PROVIDER_SIGNATURE_TIMEOUT_MS);
  });
  const lookup = (async () => {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });
    const addresses = await emailProvider.getSendAsAddresses();
    return addresses.find((address) => address.isDefault)?.signature ?? "";
  })().catch((error) => {
    logger.warn("Could not load the provider signature", { error });
    return "";
  });

  try {
    return await Promise.race([lookup, timeout]);
  } finally {
    clearTimeout(timer);
  }
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
