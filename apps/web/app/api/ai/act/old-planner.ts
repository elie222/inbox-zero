import { ActBody } from "@/app/api/ai/act/validation";
import { UserAIFields, functionsToTools, getOpenAI } from "@/utils/openai";
import { saveUsage } from "@/utils/redis/usage";
import { REQUIRES_MORE_INFO } from "@/app/api/ai/act/controller";
import { DEFAULT_AI_MODEL } from "@/utils/config";
import { ChatCompletionCreateParams } from "openai/resources/chat";

// testing out different methods to see what produces the best response
// this approach is worse :(
// may delete this soon
export async function getAiResponseOld(
  options: {
    email: Pick<ActBody["email"], "from" | "cc" | "replyTo" | "subject"> & {
      content: string;
    };
    userAbout: string;
    userEmail: string;
    functions: ChatCompletionCreateParams.Function[];
  } & UserAIFields,
) {
  const { email, userAbout, userEmail, functions } = options;

  const messages = [
    {
      role: "system" as const,
      content: `You are an AI assistant that helps people manage their emails.
  Never put placeholders in your email responses.
  Do not mention you are an AI assistant when responding to people.
  It's better not to act if you don't know how.
  
  These are the rules you can select from:
  ${functions.map((f, i) => `${i + 1}. ${f.description}`).join("\n")}`,
    },
    ...(userAbout
      ? [
          {
            role: "user" as const,
            content: `Some additional information the user has provided:\n\n${userAbout}`,
          },
        ]
      : []),
    {
      role: "user" as const,
      content: `This email was received for processing.
  
  From: ${email.from}
  Reply to: ${email.replyTo}
  CC: ${email.cc}
  Subject: ${email.subject}
  Body:
  ${email.content}`,
    },
  ];

  const model = options.aiModel || DEFAULT_AI_MODEL;

  const aiResponse = await getOpenAI(
    options.openAIApiKey,
  ).chat.completions.create({
    model,
    messages,
    tools: functionsToTools(functions),
    temperature: 0,
  });

  if (aiResponse.usage)
    await saveUsage({ email: userEmail, usage: aiResponse.usage, model });

  const functionCall =
    aiResponse?.choices?.[0]?.message.tool_calls?.[0]?.function;

  if (!functionCall?.name) return;

  if (functionCall.name === REQUIRES_MORE_INFO) return;

  return functionCall;
}
