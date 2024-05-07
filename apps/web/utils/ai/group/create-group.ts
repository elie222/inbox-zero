import { z } from "zod";
import { chatCompletion, getAiProviderAndModel } from "@/utils/llms";
import { saveAiUsage } from "@/utils/usage";
import { Group, User } from "@prisma/client";
import { parseJSON } from "@/utils/json";

export async function aiCreateGroup(
  user: User,
  group: Pick<Group, "name" | "prompt">,
  emails: Array<{ sender: string; subject: string }>,
) {
  const { model, provider } = getAiProviderAndModel(
    user.aiProvider,
    user.aiModel,
  );

  const messages = [
    {
      role: "user" as const,
      content: `You are an assistant that helps people manage their emails.
You categorise emailers into groups.

The user has created a new group called "${group.name}".
The emailers included in this group are:
${group.prompt}

Here are the last 50 emails the user has received (sender - subject line):
${emails.map((email) => `* ${email.sender} - ${email.subject}`).join("\n")}

Return JSON with the following fields:
"senders" - a list of senders that are in the group
"subjects" - a list of subjects that are in the group

Do not include explanations.

JSON:
`,
    },
  ];

  const aiResponse = await chatCompletion(
    provider,
    model,
    user.openAIApiKey,
    messages,
    { jsonResponse: true },
  );

  if (aiResponse.usage) {
    await saveAiUsage({
      email: user.email!,
      usage: aiResponse.usage,
      provider,
      model,
      label: "Create group",
    });
  }

  const responseSchema = z.object({
    senders: z.array(z.string()),
    subjects: z.array(z.string()),
  });

  if (!aiResponse.response) return;

  try {
    const result = responseSchema.parse(parseJSON(aiResponse.response));
    return result;
  } catch (error) {
    console.warn(
      "Error parsing data.\nResponse:",
      aiResponse?.response,
      "\nError:",
      error,
    );
    return;
  }
}
