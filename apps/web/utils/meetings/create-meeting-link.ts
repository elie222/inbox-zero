import { createScopedLogger } from "@/utils/logger";
import { createTeamsMeeting } from "@/utils/meetings/providers/teams";
import { createGoogleMeetConferenceData } from "@/utils/meetings/providers/google-meet";
import {
  validateProviderForAccount,
  type AccountProvider,
  type MeetingLinkResult,
} from "@/utils/meetings/providers/types";
import type { MeetingProvider } from "@/utils/meetings/parse-meeting-request";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("meetings/create-meeting-link");

export interface CreateMeetingLinkOptions {
  emailAccountId: string;
  subject: string;
  startDateTime: Date;
  endDateTime: string;
  preferredProvider?: MeetingProvider | null;
}

/**
 * Create a meeting link for a calendar event
 *
 * This function:
 * 1. Determines the user's email provider (Google or Microsoft)
 * 2. Validates the requested meeting provider is compatible
 * 3. Creates the appropriate meeting link (Teams, Google Meet)
 * 4. Returns conferenceData to attach to calendar event
 *
 * Provider compatibility:
 * - Google accounts: Can use Google Meet (native) or Zoom
 * - Microsoft accounts: Can use Teams (native) or Zoom
 * - Incompatible requests automatically fall back to native provider
 */
export async function createMeetingLink(
  options: CreateMeetingLinkOptions,
): Promise<MeetingLinkResult> {
  const {
    emailAccountId,
    subject,
    startDateTime,
    endDateTime,
    preferredProvider,
  } = options;

  logger.info("Creating meeting link", {
    emailAccountId,
    subject,
    preferredProvider,
  });

  // Get the email account to determine provider
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  // Determine account provider
  const accountProvider: AccountProvider =
    emailAccount.account.provider === "google" ? "google" : "microsoft";

  logger.trace("Account provider determined", { accountProvider });

  // Validate provider compatibility
  const validation = validateProviderForAccount(
    preferredProvider || null,
    accountProvider,
  );

  if (!validation.valid) {
    logger.warn(
      "Meeting provider not compatible with account, using fallback",
      {
        requestedProvider: preferredProvider,
        accountProvider,
        fallbackProvider: validation.resolvedProvider,
      },
    );
  }

  const providerToUse = validation.resolvedProvider;

  logger.info("Using meeting provider", {
    provider: providerToUse,
    wasFallback: validation.needsFallback,
  });

  // Handle "none" provider - no meeting link requested
  if (providerToUse === "none") {
    logger.info("No meeting link requested");
    return {
      provider: "none",
      joinUrl: "",
      conferenceData: null,
    };
  }

  // Handle Zoom - not yet implemented
  if (providerToUse === "zoom") {
    logger.warn("Zoom integration not yet implemented, falling back to native");
    const nativeProvider =
      accountProvider === "google" ? "google-meet" : "teams";
    return createMeetingLink({
      ...options,
      preferredProvider: nativeProvider,
    });
  }

  // Create meeting link based on provider
  if (providerToUse === "teams") {
    return createTeamsMeeting({
      emailAccountId,
      subject,
      startDateTime,
      endDateTime,
    });
  }

  if (providerToUse === "google-meet") {
    return createGoogleMeetConferenceData({
      emailAccountId,
      subject,
      startDateTime,
      endDateTime,
    });
  }

  throw new Error(`Unsupported meeting provider: ${providerToUse}`);
}
