import { NextResponse } from "next/server";
import { OpenAIStream, StreamingTextResponse } from "ai";
import { summarise } from "@/app/api/ai/summarise/controller";
import { withError } from "@/utils/middleware";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { summariseBody } from "@/app/api/ai/summarise/validation";
import { getSummary, saveSummary } from "@/utils/redis/summary";
import { expire } from "@/utils/redis";

export const runtime = "edge";

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = summariseBody.parse(json);

  const prompt = body.prompt.substring(0, 2048);

  const cachedSummary = await getSummary(prompt);
  if (cachedSummary) return new NextResponse(cachedSummary);

  const response = await summarise(prompt);

  const stream = OpenAIStream(response, {
    async onFinal(completion) {
      await saveSummary(prompt, completion);
      await expire(prompt, 60 * 60 * 24);
    },
  });

  return new StreamingTextResponse(stream);
});
