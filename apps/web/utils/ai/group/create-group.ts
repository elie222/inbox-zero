import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { Group, User } from "@prisma/client";

export async function aiCreateGroup(
  user: User,
  group: Pick<Group, "name" | "prompt">,
  emails: Array<{ sender: string; subject: string }>,
) {
  const prompt = `You are an assistant that helps people manage their emails.
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
`;

  const aiResponse = await chatCompletionObject({
    userAi: user,
    prompt,
    schema: z.object({
      senders: z.array(z.string()),
      subjects: z.array(z.string()),
    }),
    userEmail: user.email || "",
    usageLabel: "Create group",
  });

  return aiResponse.object;
}
