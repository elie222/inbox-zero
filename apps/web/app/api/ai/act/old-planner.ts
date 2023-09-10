import { ChatCompletionRequestMessageFunctionCall } from "openai-edge";
import { ActBody } from "@/app/api/ai/act/validation";
import { openai } from "@/utils/openai";
import { saveUsage } from "@/utils/redis/usage";
import {
  AiModel,
  ChatFunction,
  ChatCompletionResponse,
  ChatCompletionError,
  isChatCompletionError,
} from "@/utils/types";
import { REQUIRES_MORE_INFO } from "@/app/api/ai/act/controller";

// testing out different methods to see what produces the best response
// this approach is worse :(
// may delete this soon
export async function getAiResponseOld(options: {
  model: AiModel;
  email: Pick<ActBody["email"], "from" | "cc" | "replyTo" | "subject"> & {
    content: string;
  };
  userAbout: string;
  userEmail: string;
  functions: ChatFunction[];
}) {
  const { model, email, userAbout, userEmail, functions } = options;

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

  const aiResponse = await openai.createChatCompletion({
    model,
    messages,
    functions,
    function_call: "auto",
    temperature: 0,
  });

  const json: ChatCompletionResponse | ChatCompletionError =
    await aiResponse.json();

  if (isChatCompletionError(json)) {
    console.error(json);
    return;
  }

  await saveUsage({ email: userEmail, usage: json.usage, model });

  const functionCall = json?.choices?.[0]?.message.function_call as
    | ChatCompletionRequestMessageFunctionCall
    | undefined;

  if (!functionCall?.name) return;

  if (functionCall.name === REQUIRES_MORE_INFO) return;

  return functionCall;
}
