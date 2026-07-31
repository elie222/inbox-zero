import { subMinutes } from "date-fns/subMinutes";
import { MeetingProcessingStatus } from "@/generated/prisma/enums";
import { aiDraftMeetingFollowUp } from "@/utils/ai/meeting-recorder/draft-meeting-follow-up";
import {
  aiSummarizeMeeting,
  parseMeetingSummary,
  type MeetingSummary,
} from "@/utils/ai/meeting-recorder/summarize-meeting";
import { createEmailProvider } from "@/utils/email/provider";
import { captureException } from "@/utils/error";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import {
  getFollowUpRecipients,
  parseAttendeeSnapshot,
  type MeetingAttendee,
} from "@/utils/meeting-recorder/attendees";
import type { NormalizedTranscript } from "@/utils/meeting-recorder/bot-provider";
import {
  MAX_PROCESSING_ATTEMPTS,
  MEETING_RECORDER_MIN_TIER,
  STUCK_PROCESSING_MINUTES,
} from "@/utils/meeting-recorder/config";
import { sendMeetingRecapEmail } from "@/utils/meeting-recorder/send-recap";
import { checkHasAccess } from "@/utils/premium/server";
import prisma from "@/utils/prisma";
import { textToHtmlParagraphs } from "@/utils/string";
import { getEmailAccountWithAi, getWritingStyle } from "@/utils/user/get";

/**
 * Turns one account's copy of a finished recording into a summary, a follow-up
 * draft and a recap email. Every step is guarded by the field it writes, so a
 * queue retry after a partial run never sends a second email or leaves a second
 * draft behind.
 */
export async function processMeetingForAccount({
  meetingId,
  logger,
}: {
  meetingId: string;
  logger: Logger;
}): Promise<void> {
  const claim = await prisma.meeting.updateMany({
    where: {
      id: meetingId,
      // Summarizing runs a model, so a meeting that fails every time has to
      // stop rather than bill on every cron tick.
      processingAttempts: { lt: MAX_PROCESSING_ATTEMPTS },
      OR: [
        {
          processingStatus: {
            in: [
              MeetingProcessingStatus.PENDING,
              MeetingProcessingStatus.FAILED,
            ],
          },
        },
        // A run killed mid-way leaves the row claimed forever. Each sub-step is
        // guarded by the field it writes, so picking it back up is safe.
        {
          processingStatus: MeetingProcessingStatus.PROCESSING,
          updatedAt: { lt: subMinutes(new Date(), STUCK_PROCESSING_MINUTES) },
        },
      ],
    },
    data: {
      processingStatus: MeetingProcessingStatus.PROCESSING,
      processingAttempts: { increment: 1 },
    },
  });
  if (claim.count === 0) {
    logger.info("Meeting is not claimable for processing");
    return;
  }

  try {
    await runProcessingSteps({ meetingId, logger });

    await prisma.meeting.update({
      where: { id: meetingId },
      data: { processingStatus: MeetingProcessingStatus.COMPLETED },
    });
  } catch (error) {
    logger.error("Failed to process meeting", { error });
    captureException(error);

    await prisma.meeting.update({
      where: { id: meetingId },
      data: { processingStatus: MeetingProcessingStatus.FAILED },
    });

    // Mark the failure for the UI, then let the queue see it too. Swallowing
    // here would report success and burn the only retry a transient AI or
    // mailbox failure gets. Each sub-step is separately guarded, so a retry
    // resumes rather than repeating work.
    throw error;
  }
}

async function runProcessingSteps({
  meetingId,
  logger,
}: {
  meetingId: string;
  logger: Logger;
}): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      recording: { select: { transcript: true } },
      emailAccount: {
        select: {
          meetingRecorderEnabled: true,
          meetingRecorderRecapEmailEnabled: true,
          meetingRecorderFollowUpDraftEnabled: true,
        },
      },
    },
  });
  if (!meeting) throw new Error("Meeting not found");

  if (!meeting.emailAccount.meetingRecorderEnabled) {
    logger.info("Skipping meeting because the notetaker is disabled");
    return;
  }

  const transcript = meeting.recording?.transcript as
    | NormalizedTranscript
    | null
    | undefined;
  if (!transcript?.length) {
    logger.info("Skipping meeting with an empty transcript");
    return;
  }

  const emailAccount = await getEmailAccountWithAi({
    emailAccountId: meeting.emailAccountId,
  });
  if (!emailAccount) throw new Error("Email account not found");

  const hasAccess = await checkHasAccess({
    userId: emailAccount.userId,
    minimumTier: MEETING_RECORDER_MIN_TIER,
  });
  if (!hasAccess) {
    logger.info("Skipping meeting because the plan does not include it");
    return;
  }

  const attendees = parseAttendeeSnapshot(meeting.attendees);

  const summary =
    parseMeetingSummary(meeting.summary) ??
    (await summarizeAndSave({
      meetingId,
      emailAccount,
      eventTitle: meeting.eventTitle,
      attendees,
      transcript,
    }));

  const recipients = getFollowUpRecipients(attendees, emailAccount.email);
  const wantsDraft =
    meeting.emailAccount.meetingRecorderFollowUpDraftEnabled &&
    recipients.length > 0 &&
    !meeting.followUpDraftStartedAt;

  if (wantsDraft) {
    await createFollowUpDraft({
      meetingId,
      emailAccount,
      provider: emailAccount.account.provider,
      eventTitle: meeting.eventTitle,
      summary,
      recipients,
      logger,
    });
  }

  if (
    meeting.emailAccount.meetingRecorderRecapEmailEnabled &&
    !meeting.recapSentAt
  ) {
    // Read before claiming the send, so a transient read failure retries
    // instead of burning the one-way recap claim.
    const refreshedMeeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { followUpDraftId: true },
    });

    // Claim the send before doing it: a duplicate recap is worse than a missing
    // one, and the user can always open the meeting in the app.
    const claim = await prisma.meeting.updateMany({
      where: { id: meetingId, recapSentAt: null },
      data: { recapSentAt: new Date() },
    });

    if (claim.count > 0) {
      await sendMeetingRecapEmail({
        emailAccountId: meeting.emailAccountId,
        userEmail: emailAccount.email,
        provider: emailAccount.account.provider,
        timezone: emailAccount.timezone,
        meetingTitle: meeting.eventTitle,
        startTime: meeting.startTime,
        summary,
        followUpDraftCreated: !!refreshedMeeting?.followUpDraftId,
        logger,
      });
    }
  }
}

async function summarizeAndSave({
  meetingId,
  emailAccount,
  eventTitle,
  attendees,
  transcript,
}: {
  meetingId: string;
  emailAccount: EmailAccountWithAI;
  eventTitle: string;
  attendees: MeetingAttendee[];
  transcript: NormalizedTranscript;
}): Promise<MeetingSummary> {
  const summary = await aiSummarizeMeeting({
    emailAccount,
    eventTitle,
    attendees,
    transcript,
  });

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { summary },
  });

  return summary;
}

async function createFollowUpDraft({
  meetingId,
  emailAccount,
  provider,
  eventTitle,
  summary,
  recipients,
  logger,
}: {
  meetingId: string;
  emailAccount: EmailAccountWithAI;
  provider: string;
  eventTitle: string;
  summary: MeetingSummary;
  recipients: MeetingAttendee[];
  logger: Logger;
}): Promise<void> {
  const writingStyle = await getWritingStyle({
    emailAccountId: emailAccount.id,
  });

  const draft = await aiDraftMeetingFollowUp({
    emailAccount,
    eventTitle,
    summary,
    recipients,
    writingStyle,
  });

  const emailProvider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider,
    logger,
  });

  // Claim only after every step without a mailbox side effect has succeeded,
  // so a transient AI failure leaves the claim for the retry. The claim still
  // lands before the mailbox write: if we crash between the two, the draft is
  // forfeited, because a retry that might leave a second draft is worse.
  const claim = await prisma.meeting.updateMany({
    where: { id: meetingId, followUpDraftStartedAt: null },
    data: { followUpDraftStartedAt: new Date() },
  });
  if (claim.count === 0) {
    logger.info("Follow-up draft already claimed by another run");
    return;
  }

  const { id } = await emailProvider.createDraft({
    to: recipients.map((recipient) => recipient.email).join(", "),
    subject: draft.subject,
    messageHtml: textToHtmlParagraphs(draft.body),
  });

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { followUpDraftId: id },
  });

  logger.info("Created meeting follow-up draft", { draftId: id });
}
