import type { Task, TaskActivity, TaskEmail } from "@/generated/prisma/client";
import type { EmailProvider } from "@/utils/email/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import { aiGenerateTaskOverview } from "@/utils/ai/tasks/generate-task-overview";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import prisma from "@/utils/prisma";

type TaskWithContext = Task & {
  subtasks: { title: string; status: Task["status"] }[];
  emails: TaskEmail[];
  activity: TaskActivity[];
};

// Rebuilds a task's AI overview from its linked emails (full bodies fetched
// from the provider), subtasks, and activity, and persists it with an
// AI_UPDATE timeline entry. Returns the new overview, or null when the AI
// had nothing to work with.
export async function regenerateTaskOverview({
  task,
  emailAccount,
  emailProvider,
  logger,
  activityNote = "AI overview refreshed",
}: {
  task: TaskWithContext;
  emailAccount: EmailAccountWithAI;
  emailProvider: EmailProvider | null;
  logger: Logger;
  activityNote?: string;
}): Promise<string | null> {
  // The linked rows only cache display fields; the AI reads the real
  // message bodies from the provider
  const emails = await Promise.all(
    task.emails.map(async (email) => {
      try {
        const message = await emailProvider?.getMessage(email.messageId);
        return {
          ...email,
          content: message
            ? getEmailForLLM(message, { maxLength: 3000 }).content
            : null,
        };
      } catch (error) {
        // The message may have been deleted or moved out of reach since
        // linking; the cached snippet still gives the AI something
        logger.warn("Linked email unavailable for task overview", {
          taskId: task.id,
          error,
        });
        return { ...email, content: null };
      }
    }),
  );

  const result = await aiGenerateTaskOverview({
    emailAccount,
    task,
    subtasks: task.subtasks,
    emails,
    activity: task.activity,
  });
  if (!result) return null;

  await prisma.task.update({
    where: { id: task.id },
    data: {
      aiStatusSummary: result.overview,
      activity: {
        create: { type: "AI_UPDATE", content: activityNote },
      },
    },
  });

  return result.overview;
}
