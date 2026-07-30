import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { createGenerateObject } from "@/utils/llms";
import { getUserInfoPrompt } from "@/utils/ai/helpers";
import { TASK_STATUS_LABELS, type TaskListItem } from "@/utils/tasks";

const schema = z.object({
  body: z
    .string()
    .describe(
      "The plain-text body of the follow-up email: a short, friendly check-in (2-4 sentences) asking the assignee for a status update on the task. No subject line. Ends with a sign-off using the sender's name when known.",
    ),
});
export type DraftTaskFollowUpResult = z.infer<typeof schema>;

type FollowUpTask = Pick<
  TaskListItem,
  "title" | "description" | "status" | "dueAt" | "aiStatusSummary"
> & { followUpCount: number };

// Writes the check-in email the agent sends to a task's assignee. The body
// stays short and concrete; repeated chases acknowledge earlier ones.
export async function aiDraftTaskFollowUpEmail({
  emailAccount,
  task,
  assigneeEmail,
  senderName,
  recentActivity,
}: {
  emailAccount: EmailAccountWithAI;
  task: FollowUpTask;
  assigneeEmail: string;
  senderName: string | null;
  recentActivity: { content: string; createdAt: Date }[];
}): Promise<DraftTaskFollowUpResult | null> {
  const system = `You are an AI assistant that writes short follow-up emails on the user's behalf, chasing a delegated task for a status update.

<instructions>
Write the plain-text body of a brief, friendly, professional check-in email to the assignee about the task below.
- 2-4 sentences. Name the task naturally, ask for a concrete status update, and mention the due date only if there is one.
- If this isn't the first follow-up, acknowledge that lightly without nagging.
- Never invent progress, agreements, or details that aren't in the provided context.
- No subject line, no placeholders. Sign off with the sender's first name when known, otherwise no signature.
- Write in the language the task and its activity predominantly use.
</instructions>

${getUserInfoPrompt({ emailAccount })}

<outputFormat>
Respond with a JSON object: { "body": string }
</outputFormat>`;

  const lines = [
    `Title: ${task.title}`,
    task.description ? `Description: ${task.description}` : null,
    `Status: ${TASK_STATUS_LABELS[task.status]}`,
    task.dueAt ? `Due: ${new Date(task.dueAt).toISOString()}` : null,
    task.aiStatusSummary ? `Latest AI overview: ${task.aiStatusSummary}` : null,
    `Follow-ups already sent: ${task.followUpCount}`,
    `Assignee: ${assigneeEmail}`,
    senderName ? `Sender name: ${senderName}` : null,
  ].filter(Boolean);

  const prompt = `<task>
${lines.join("\n")}
</task>

<recent_activity>
${
  recentActivity
    .map(
      (entry) => `${new Date(entry.createdAt).toISOString()}: ${entry.content}`,
    )
    .join("\n") || "None"
}
</recent_activity>`;

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.TaskFollowUp,
  );

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Draft task follow-up",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "compact" },
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema,
  });

  return aiResponse.object;
}
