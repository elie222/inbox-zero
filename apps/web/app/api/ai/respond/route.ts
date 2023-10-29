import { z } from "zod";
import { NextResponse } from "next/server";
import { AIModel, UserAIFields, getOpenAI } from "@/utils/openai";
import { DEFAULT_AI_MODEL } from "@/utils/config";
import { withError } from "@/utils/middleware";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";

const respondBody = z.object({ message: z.string() });
export type RespondBody = z.infer<typeof respondBody>;
export type RespondResponse = Awaited<ReturnType<typeof respond>>;

async function respond(body: RespondBody, userAIFields: UserAIFields) {
  const response = await getOpenAI(
    userAIFields.openAIApiKey
  ).chat.completions.create({
    model: userAIFields.aiModel || DEFAULT_AI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are an AI assistant that helps the user respond to their emails. You are friendly, concise, and informal. The user will send you email messages and it is your job to write a response to them.",
      },
      {
        role: "user",
        content: `Please write a response for to this email for me:\n\n###\n\n${body.message}`,
      },
    ],
    stream: true,
  });
  return response;
}

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const json = await request.json();
  const body = respondBody.parse(json);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      aiModel: true,
      openAIApiKey: true,
    },
  });

  const res = await respond(body, {
    aiModel: user.aiModel as AIModel,
    openAIApiKey: user.openAIApiKey,
  });

  return NextResponse.json(res);
});
