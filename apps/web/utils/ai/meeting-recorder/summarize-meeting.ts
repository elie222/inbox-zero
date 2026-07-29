import { z } from "zod";
import { createGenerateObject } from "@/utils/llms/index";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { createScopedLogger } from "@/utils/logger";
import type { MeetingAttendee } from "@/utils/meeting-recorder/attendees";
import type { NormalizedTranscript } from "@/utils/meeting-recorder/bot-provider";
import { transcriptToPromptText } from "@/utils/meeting-recorder/transcript-prompt";

const logger = createScopedLogger("SummarizeMeeting");

const systemPrompt = `You are an expert notetaker summarizing a meeting from its transcript.

The transcript is automatically generated. Speaker labels can be wrong, words can be misheard, and people interrupt each other. Read it as imperfect evidence of what was said, not as a verbatim record.

Rules:
- Only report things that were actually said. Never invent a decision, a commitment, an owner or a date.
- Attribute an action item to someone only when the transcript shows that person taking it on. If the owner is unclear, set the owner to null rather than guessing.
- When the meeting reverses an earlier decision, report the final position, not the one that was superseded.
- If a speaker label looks wrong or two speakers have similar names, prefer describing what was decided over who said it.
- Keep the summary proportional to the meeting. Do not repeat the same fact across sections.
- Put settled choices in decisions and concrete follow-up work in action items. Include any agreed deadline in the action item's description.
- Use next steps only for distinct sequencing or follow-up that is not already captured as an action item.
- Leave a section empty when it has nothing distinct to add. An empty list is better than a filler entry.
- Write in the language the meeting was held in.
- Write for someone who attended and wants a reminder, not for someone who needs the meeting re-narrated.

Return your response in JSON format.`;

const summarySchema = z.object({
  overview: z
    .string()
    .describe("A short paragraph covering what the meeting was about"),
  keyDecisions: z
    .array(z.string())
    .describe(
      "Choices the group actually settled on, excluding work that belongs in action items",
    ),
  actionItems: z
    .array(
      z.object({
        description: z.string(),
        owner: z
          .string()
          .nullable()
          .describe(
            "The owner when the transcript shows who took this on, otherwise null",
          ),
      }),
    )
    .describe(
      "Concrete follow-up work agreed in the meeting, including any deadline",
    ),
  openQuestions: z
    .array(z.string())
    .describe("Questions raised but left unresolved"),
  nextSteps: z
    .array(z.string())
    .describe(
      "Distinct sequencing or follow-up not already captured in action items",
    ),
});

export type MeetingSummary = z.infer<typeof summarySchema>;

/**
 * Reads back a summary we stored as JSON. Parsed rather than cast so a row
 * written before a schema change is re-summarized instead of rendered with
 * fields the UI no longer expects.
 */
export function parseMeetingSummary(value: unknown): MeetingSummary | null {
  const parsed = summarySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function aiSummarizeMeeting({
  emailAccount,
  eventTitle,
  attendees,
  transcript,
}: {
  emailAccount: EmailAccountWithAI;
  eventTitle: string;
  attendees: MeetingAttendee[];
  transcript: NormalizedTranscript;
}): Promise<MeetingSummary> {
  logger.info("Summarizing meeting", { utterances: transcript.length });

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.MeetingSummary,
  );

  // The transcript is third-party speech, so anything in it that looks like an
  // instruction is data, not a command.
  const generateObject = createGenerateObject({
    emailAccount,
    label: "Summarize meeting",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "full" },
  });

  const result = await generateObject({
    ...modelOptions,
    system: systemPrompt,
    prompt: getUserPrompt({ eventTitle, attendees, transcript }),
    schema: summarySchema,
  });

  return result.object;
}

function getUserPrompt({
  eventTitle,
  attendees,
  transcript,
}: {
  eventTitle: string;
  attendees: MeetingAttendee[];
  transcript: NormalizedTranscript;
}): string {
  const attendeeList = attendees
    .map((attendee) =>
      attendee.name ? `${attendee.name} (${attendee.email})` : attendee.email,
    )
    .join("\n");

  return `Meeting title: ${eventTitle}

Invited attendees:
${attendeeList || "Not recorded"}

Transcript:
${transcriptToPromptText(transcript)}

Summarize this meeting.`;
}
