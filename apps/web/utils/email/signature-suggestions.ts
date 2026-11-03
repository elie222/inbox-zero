import { z } from "zod";
import prisma from "@/utils/prisma";
import { getSignatureSuggestionsHintId } from "@/utils/email/default-signature";
import { createEmailProvider } from "@/utils/email/provider";
import {
  findSentSignatures,
  getSignatureKey,
  MAX_SIGNATURE_SUGGESTIONS,
} from "@/utils/email/sent-signatures";
import type { Logger } from "@/utils/logger";

const SCAN_VERSION = 1;
const SCAN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FAILED_SCAN_MAX_AGE_MS = 60 * 60 * 1000;
// A signature seen once may be a one-off sign-off rather than one they reuse.
const MIN_USES = 2;

const sentSignatureScanSchema = z.object({
  version: z.literal(SCAN_VERSION),
  signatures: z.array(z.object({ html: z.string(), count: z.number() })),
  providerSignature: z.boolean(),
  failed: z.boolean().optional(),
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
  const maxAge =
    cached.success && cached.data.failed
      ? FAILED_SCAN_MAX_AGE_MS
      : SCAN_MAX_AGE_MS;
  const isFresh =
    emailAccount.sentSignatureScannedAt &&
    Date.now() - emailAccount.sentSignatureScannedAt.getTime() < maxAge;
  const savedSignatures = [
    emailAccount.signature ?? "",
    ...emailAccount.emailSignatures.map(({ html }) => html),
  ];
  const scan =
    cached.success && isFresh
      ? cached.data
      : await scanSentSignatures({
          emailAccountId,
          provider: emailAccount.account.provider,
          logger,
        });

  const known = new Set(savedSignatures.map(getSignatureKey));
  const suggestions = scan.signatures
    .filter(
      ({ html, count }) =>
        count >= MIN_USES && !known.has(getSignatureKey(html)),
    )
    .slice(0, MAX_SIGNATURE_SUGGESTIONS);

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
  let scan: SentSignatureScan = {
    version: SCAN_VERSION,
    signatures: [],
    providerSignature: false,
  };
  try {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });
    const providerSignature = await emailProvider
      .getSendAsAddresses()
      .then(
        (addresses) =>
          addresses.find((address) => address.isDefault)?.signature ?? "",
      )
      .catch((error) => {
        logger.warn("Could not read the provider signature", { error });
        return null;
      });
    scan = {
      version: SCAN_VERSION,
      signatures: await findSentSignatures({
        emailProvider,
        knownSignatures: [providerSignature ?? ""],
      }),
      // Unknown counts as present so we never claim their mail goes out unsigned.
      providerSignature: providerSignature !== "",
    };
  } catch (error) {
    logger.warn("Could not scan sent mail for signatures", { error });
    scan.failed = true;
  }

  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: { sentSignatureScan: scan, sentSignatureScannedAt: new Date() },
  });
  return scan;
}
