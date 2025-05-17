import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { NextResponse } from "next/server";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";

export const maxDuration = 120;

const assistantInputSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
});

export const POST = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const user = await getEmailAccountWithAi({ emailAccountId });

  if (!user) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = assistantInputSchema.safeParse(json);

  if (body.error) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }

  const result = await aiProcessAssistantChat({
    messages: body.data.messages,
    emailAccountId,
    user,
  });

  return result.toDataStreamResponse();
});
