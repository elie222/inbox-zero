import "server-only";

import { createAI, createStreamableUI, getMutableAIState } from "ai/rsc";
import { SendIcon } from "lucide-react";
import { getOpenAI } from "@/utils/openai";
import {
  BotCard,
  BotMessage,
  SystemMessage,
} from "@/app/(app)/chat/components/message";
import { spinner } from "@/app/(app)/chat/components/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { runOpenAICompletion } from "@/app/(app)/chat/utils";
import { actionFunctions } from "@/utils/ai/actions";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";

async function confirmSendEmail(to: string) {
  "use server";

  const aiState = getMutableAIState<typeof AI>();

  const sending = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">Send email to {to}...</p>
    </div>,
  );

  const systemMessage = createStreamableUI(null);

  // runAsyncFnWithoutBlocking(async () => {
  //   // You can update the UI at any point.
  //   purchasing.update(
  //     <div className="inline-flex items-start gap-1 md:items-center">
  //       {spinner}
  //       <p className="mb-2">
  //         Purchasing {amount} ${symbol}... working on it...
  //       </p>
  //     </div>,
  //   );

  //   purchasing.done(
  //     <div>
  //       <p className="mb-2">
  //         You have successfully purchased {amount} ${symbol}. Total cost:{' '}
  //         {formatNumber(amount * price)}
  //       </p>
  //     </div>,
  //   );

  //   systemMessage.done(
  //     <SystemMessage>
  //       You have purchased {amount} shares of {symbol} at ${price}. Total cost ={' '}
  //       {formatNumber(amount * price)}.
  //     </SystemMessage>,
  //   );

  //   aiState.done([
  //     ...aiState.get(),
  //     {
  //       role: 'system',
  //       content: `[User has purchased ${amount} shares of ${symbol} at ${price}. Total cost = ${amount * price
  //         }]`,
  //     },
  //   ]);
  // });

  return {
    sendingUI: sending.value,
    newMessage: {
      id: Date.now(),
      display: systemMessage.value,
    },
  };
}

async function submitUserMessage(content: string) {
  "use server";

  const aiState = getMutableAIState<typeof AI>();
  aiState.update([
    ...aiState.get(),
    {
      role: "user",
      content,
    },
  ]);

  const reply = createStreamableUI(
    <BotMessage className="items-center">{spinner}</BotMessage>,
  );

  const openai = getOpenAI(null);

  const completion = runOpenAICompletion(openai, {
    model: "gpt-3.5-turbo",
    stream: true,
    messages: [
      {
        role: "system",
        content: `You are an email assistant bot and you can help users send emails, step by step.`,
      },
      ...aiState.get().map((info: any) => ({
        role: info.role,
        content: info.content,
        name: info.name,
      })),
    ],
    functions: actionFunctions,
    // functions: [
    //   {
    //     name: "send_email",
    //     description:
    //       "Send an email to the recipient. Use this if the user wants to send an email.",
    //     parameters: z.object({
    //       to: z.string().describe("The recipient of the email."),
    //       subject: z.string().describe("The subject of the email."),
    //       body: z.string().describe("The body of the email."),
    //     }),
    //   },
    //   {
    //     name: "list_important_emails",
    //     description:
    //       "List important emails. Use this if the user wants to see important emails.",
    //     parameters: z.object({
    //       count: z
    //         .number()
    //         .optional()
    //         .describe("The number of emails to list."),
    //     }),
    //   },
    // ],
    temperature: 0,
  });

  completion.onTextContent((content: string, isFinal: boolean) => {
    reply.update(<BotMessage>{content}</BotMessage>);
    if (isFinal) {
      reply.done();
      aiState.done([...aiState.get(), { role: "assistant", content }]);
    }
  });

  completion.onFunctionCall("list_important_emails", async ({ count }) => {
    console.log("list_important_emails", count);
    reply.update(
      <BotCard>
        <Skeleton />
      </BotCard>,
    );

    const emails = [
      { from: "Jim", subject: "Important email about buying car" },
      { from: "Jane", subject: "Important email about house repairs" },
    ];

    reply.done(
      <BotCard>
        <ul>
          {emails.map((email) => (
            <li key={email.subject}>
              <div>
                <p>{email.from}</p>
                <p>{email.subject}</p>
              </div>
            </li>
          ))}
        </ul>
      </BotCard>,
    );

    aiState.done([
      ...aiState.get(),
      {
        role: "function",
        name: "list_important_emails",
        content: JSON.stringify(emails),
      },
    ]);
  });

  completion.onFunctionCall("draft", async (options: any) => {
    console.log("draft", options);
    reply.update(
      <BotCard>
        <Skeleton />
      </BotCard>,
    );

    reply.done(
      <BotCard>
        <Card title="Draft">
          <p>
            <strong>To:</strong> {options.to}
          </p>
          {options.cc && (
            <p>
              <strong>CC:</strong> {options.cc}
            </p>
          )}
          {options.bcc && (
            <p>
              <strong>BCC:</strong> {options.bcc}
            </p>
          )}
          <p className="mt-2">
            <strong>{options.subject}</strong>
          </p>
          <p className="mt-1">{options.content}</p>
          <Button className="mt-2">
            <SendIcon className="mr-2 h-4 w-4" />
            Send
          </Button>
        </Card>
      </BotCard>,
    );

    aiState.done([
      ...aiState.get(),
      {
        role: "function",
        name: "draft",
        content: JSON.stringify(options),
      },
    ]);
  });

  return {
    id: Date.now(),
    display: reply.value,
  };
}

const initialAIState: {
  role: "user" | "assistant" | "system" | "function";
  content: string;
  id?: string;
  name?: string;
}[] = [];

const initialUIState: {
  id: number;
  display: React.ReactNode;
}[] = [];

export const AI = createAI({
  actions: {
    submitUserMessage,
    confirmSendEmail,
  },
  initialUIState,
  initialAIState,
});
