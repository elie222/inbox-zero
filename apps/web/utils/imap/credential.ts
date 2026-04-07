import prisma from "@/utils/prisma";
import { decryptToken } from "@/utils/encryption";
import type { ImapCredentialConfig } from "@/utils/imap/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("imap/credential");

/**
 * Load and decrypt IMAP credentials for an email account.
 */
export async function getImapCredentials(
  emailAccountId: string,
): Promise<ImapCredentialConfig> {
  const emailAccount = await prisma.emailAccount.findUniqueOrThrow({
    where: { id: emailAccountId },
    select: {
      email: true,
      id: true,
      account: {
        select: {
          imapCredential: true,
        },
      },
    },
  });

  const credential = emailAccount.account?.imapCredential;
  if (!credential) {
    throw new Error(
      `No IMAP credentials found for email account ${emailAccountId}`,
    );
  }

  const password = decryptToken(credential.password);
  if (!password) {
    logger.error("Failed to decrypt IMAP password", { emailAccountId });
    throw new Error("Failed to decrypt IMAP credentials");
  }

  return {
    imapHost: credential.imapHost,
    imapPort: credential.imapPort,
    imapSecurity: credential.imapSecurity as "tls" | "starttls" | "none",
    smtpHost: credential.smtpHost,
    smtpPort: credential.smtpPort,
    smtpSecurity: credential.smtpSecurity as "tls" | "starttls" | "none",
    username: credential.username,
    password,
    email: emailAccount.email,
    emailAccountId: emailAccount.id,
  };
}
