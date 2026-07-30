import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { createGenerateObject } from "@/utils/llms";
import { getUserInfoPrompt } from "@/utils/ai/helpers";
import { TASK_STATUS_LABELS, type TaskListItem } from "@/utils/tasks";

const schema = z.object({
  overview: z
    .string()
    .describe(
      "A 1-3 sentence status overview of the task: where it stands, what's blocking it or what happens next, and who's waiting on whom. Written for the task's owner, in plain language.",
    ),
});
export type GenerateTaskOverviewResult = z.infer<typeof schema>;

type OverviewTask = Pick<
  TaskListItem,
  "title" | "description" | "status" | "priority" | "dueAt" | "assigneeEmail"
>;

// Writes the running "AI overview" for a task from its linked emails,
// subtasks, and activity timeline. Returns null when there's nothing beyond
// the bare task to summarize.
export async function aiGenerateTaskOverview({
  emailAccount,
  task,
  subtasks,
  emails,
  activity,
}: {
  emailAccount: EmailAccountWithAI;
  task: OverviewTask;
  subtasks: { title: string; status: string }[];
  emails: {
    from: string;
    subject: string;
    snippet: string | null;
    receivedAt: Date | null;
    // Full body fetched from the provider; null when no longer retrievable
    content?: string | null;
  }[];
  activity: { content: string; createdAt: Date }[];
}): Promise<GenerateTaskOverviewResult | null> {
  if (!emails.length && !activity.length && !subtasks.length) return null;

  const system = `You are an AI assistant that keeps a short status overview for a user's task, based on emails and notes linked to it.

<instructions>
Summarize where the task stands right now in 1-3 sentences: latest developments, what's blocking it or what happens next, and who is waiting on whom. Prefer the most recent information when sources disagree. Only state what the material supports — never invent progress, dates, or commitments. Write in the language the linked material predominantly uses.
</instructions>

${getUserInfoPrompt({ emailAccount })}

<outputFormat>
Respond with a JSON object: { "overview": string }
</outputFormat>`;

  const lines = [
    `Title: ${task.title}`,
    task.description ? `Description: ${task.description}` : null,
    `Status: ${TASK_STATUS_LABELS[task.status]}`,
    `Priority: ${task.priority}`,
    task.dueAt ? `Due: ${new Date(task.dueAt).toISOString()}` : null,
    task.assigneeEmail
      ? `Assignee: ${task.assigneeEmail}`
      : "Assignee: the user themselves",
  ].filter(Boolean);

  const prompt = `<task>
${lines.join("\n")}
</task>

<subtasks>
${subtasks.map((subtask) => `- [${subtask.status}] ${subtask.title}`).join("\n") || "None"}
</subtasks>

<linked_emails>
${
  emails
    .map(
      (email) =>
        `From: ${email.from}${email.receivedAt ? ` (${new Date(email.receivedAt).toISOString()})` : ""}\nSubject: ${email.subject}\n${email.content || email.snippet || "(body unavailable)"}`,
    )
    .join("\n---\n") || "None"
}
</linked_emails>

<activity_log>
${
  activity
    .map(
      (entry) => `${new Date(entry.createdAt).toISOString()}: ${entry.content}`,
    )
    .join("\n") || "None"
}
</activity_log>`;

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.TaskOverview,
  );

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Generate task overview",
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
