import { z } from "zod";
import prisma from "@/utils/prisma";
import { getSignatureSuggestionsHintId } from "@/utils/email/default-signature";
import { createEmailProvider } from "@/utils/email/provider";
import {
  findSentSignatures,
  getSignatureKey,
} from "@/utils/email/sent-signatures";
import type { Logger } from "@/utils/logger";

const SCAN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// A signature seen once may be a one-off sign-off rather than one they reuse.
const MIN_USES = 2;

const sentSignatureScanSchema = z.object({
  signatures: z.array(z.object({ html: z.string(), count: z.number() })),
  providerSignature: z.boolean(),
});
type SentSignatureScan = z.infer<typeof sentSignatureScanSchema>;

// Signatures the user sends that Inbox Zero doesn't know yet. The sent mail is
// scanned once and the result kept on the account, so this is cheap to call.
export async function getSignatureSuggestions({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      signature: true,
      sentSignatureScan: true,
      sentSignatureScannedAt: true,
      account: { select: { provider: true } },
      emailSignatures: { select: { html: true } },
      user: { select: { dismissedHints: true } },
    },
  });
  const none = { suggestions: [], needsDefault: false };
  if (!emailAccount) return none;
  if (
    emailAccount.user.dismissedHints.includes(
      getSignatureSuggestionsHintId(emailAccountId),
    )
  )
    return none;

  const cached = sentSignatureScanSchema.safeParse(
    emailAccount.sentSignatureScan,
  );
  const isFresh =
    emailAccount.sentSignatureScannedAt &&
    Date.now() - emailAccount.sentSignatureScannedAt.getTime() <
      SCAN_MAX_AGE_MS;
  const scan =
    cached.success && isFresh
      ? cached.data
      : await scanSentSignatures({
          emailAccountId,
          provider: emailAccount.account.provider,
          logger,
        });

  const known = new Set(
    [
      emailAccount.signature ?? "",
      ...emailAccount.emailSignatures.map(({ html }) => html),
    ].map(getSignatureKey),
  );
  const suggestions = scan.signatures.filter(
    ({ html, count }) => count >= MIN_USES && !known.has(getSignatureKey(html)),
  );

  return {
    suggestions,
    // Without a saved or provider signature, their mail goes out unsigned.
    needsDefault:
      suggestions.length > 0 &&
      !emailAccount.signature &&
      !scan.providerSignature,
  };
}

async function scanSentSignatures({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  let scan: SentSignatureScan = { signatures: [], providerSignature: false };
  try {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });
    const addresses = await emailProvider.getSendAsAddresses();
    const providerSignature =
      addresses.find((address) => address.isDefault)?.signature ?? "";
    scan = {
      signatures: await findSentSignatures({
        emailProvider,
        knownSignatures: [providerSignature],
      }),
      providerSignature: !!providerSignature,
    };
  } catch (error) {
    // Kept as an empty scan so a failing mailbox isn't rescanned on every load.
    logger.warn("Could not scan sent mail for signatures", { error });
  }

  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: { sentSignatureScan: scan, sentSignatureScannedAt: new Date() },
  });
  return scan;
}
