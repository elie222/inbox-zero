import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { composeAutocompleteBody } from "@/app/api/ai/compose-autocomplete/validation";
import { chatCompletionStream } from "@/utils/llms";
import { getEmailAccountWithAi } from "@/utils/user/get";

export const POST = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const user = await getEmailAccountWithAi({ emailAccountId });

  if (!user) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const { prompt } = composeAutocompleteBody.parse(json);

  const system = `You are an AI writing assistant that continues existing text based on context from prior text.
Give more weight/priority to the later characters than the beginning ones.
Limit your response to no more than 200 characters, but make sure to construct complete sentences.`;

  const response = await chatCompletionStream({
    userAi: user.user,
    messages: [
      {
        role: "system",
        content: system,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    userEmail: user.email,
    usageLabel: "Compose auto complete",
  });

  return response.toTextStreamResponse();
});
