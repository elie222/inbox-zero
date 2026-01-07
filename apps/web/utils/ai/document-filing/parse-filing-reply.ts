import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";

const system = `You are a document filing assistant. The user received a notification that we filed their document attachment to their Drive. They have replied to that email.

Determine their intent and always provide a reply to send back.

Actions:
- "approve": User is happy with the filing. We will mark it as approved in the database.
- "move": User wants the document in a different folder. We will move the file to the path they specify.
- "undo": User wants to reverse the filing. We will delete the file from Drive.
- "none": No action needed, just answering a question or continuing conversation.

Always write a helpful, concise reply.`;

const schema = z.object({
  action: z.enum(["approve", "move", "undo", "none"]),
  folderPath: z.string().optional(),
  reply: z.string(),
});

export type ParseFilingReplyResult = z.infer<typeof schema>;

interface FilingContext {
  filename: string;
  currentFolder: string;
}

type Message = { role: "user" | "assistant"; content: string };

export async function aiParseFilingReply({
  messages,
  filingContext,
  emailAccount,
}: {
  messages: Message[];
  filingContext: FilingContext;
  emailAccount: EmailAccountWithAI;
}): Promise<ParseFilingReplyResult> {
  if (!messages.length) {
    return { action: "none", reply: "" };
  }

  const formattedMessages = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const prompt = `<filing>
Document: "${filingContext.filename}"
Current folder: "${filingContext.currentFolder}"
</filing>

<conversation>
${formattedMessages}
</conversation>

${emailAccount.about ? `<user_info>${emailAccount.about}</user_info>` : ""}

Determine the action and write a reply.`;

  const modelOptions = getModel(emailAccount.user, "economy");

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Parse filing reply",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema,
  });

  return result.object;
}
