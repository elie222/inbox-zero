import { z } from "zod";
import { DEFAULT_AI_MODEL } from "@/utils/config";
import { parseJSON } from "@/utils/json";
import { UserAIFields, getOpenAI } from "@/utils/openai";

const aiResponseSchema = z.object({
  coldEmail: z.boolean().nullish(),
  expandEmail: z.boolean().nullish(),
});

export async function aiIsColdEmail(
  email: {
    from: string;
    subject: string;
    body: string;
  },
  userOptions: UserAIFields & { coldEmailPrompt: string | null },
) {
  const message = `Determine if this email is a cold email or not.

${
  userOptions.coldEmailPrompt ||
  `Examples of cold emails:
- Agency trying to sell something
- Recruiter trying to hire you
- Analyst at a VC trying to invest in your company

Not cold emails include:
- Email from a friend or colleague
- Email from someone you met at a conference
- Email from a customer
- Newsletter
- Password reset
- Welcome emails
- Receipts
- Promotions
- Alerts
- Updates

Most emails are not cold emails. Even if they are annoying.`
}

Return a JSON object with a "coldEmail" and "expandEmail" field.

An example response is:
{
  "coldEmail": true,
  "expandEmail": false
}

Set "expandEmail" to true if want to read more of the email before deciding whether this is a cold email.

## Email

From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}
`;

  const response = await getOpenAI(
    userOptions.openAIApiKey,
  ).chat.completions.create({
    model: userOptions.aiModel || DEFAULT_AI_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an assistant that decides if an email is a cold email or not.",
      },
      {
        role: "user",
        content: message,
      },
    ],
  });

  const content = response.choices[0].message.content;

  // this is an error
  if (!content) return false;

  try {
    const res = parseJSON(content);
    const parsedResponse = aiResponseSchema.parse(res);

    // TODO expand email if parsedResponse.expandEmail is true

    return parsedResponse.coldEmail;
  } catch (error) {
    console.error("Error parsing json:", content);
    return false;
  }
}
