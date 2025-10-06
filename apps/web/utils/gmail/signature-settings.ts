import type { gmail_v1 } from "@googleapis/gmail";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("gmail-signature");

export interface GmailSignature {
  email: string;
  signature: string;
  isDefault: boolean;
  displayName?: string;
}

/**
 * Fetches all signatures from Gmail using the sendAs settings API
 * https://developers.google.com/gmail/api/reference/rest/v1/users.settings.sendAs
 */
export async function getGmailSignatures(
  gmail: gmail_v1.Gmail,
): Promise<GmailSignature[]> {
  try {
    const sendAsList = await gmail.users.settings.sendAs.list({
      userId: "me",
    });

    if (!sendAsList.data.sendAs || sendAsList.data.sendAs.length === 0) {
      logger.warn("No sendAs settings found");
      return [];
    }

    const signatures: GmailSignature[] = [];

    for (const sendAs of sendAsList.data.sendAs) {
      if (!sendAs.sendAsEmail) continue;

      signatures.push({
        email: sendAs.sendAsEmail,
        signature: sendAs.signature || "",
        isDefault: sendAs.isDefault ?? false,
        displayName: sendAs.displayName || undefined,
      });
    }

    logger.info("Gmail signatures fetched successfully", {
      count: signatures.length,
    });

    return signatures;
  } catch (error) {
    logger.error("Failed to fetch Gmail signatures", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
