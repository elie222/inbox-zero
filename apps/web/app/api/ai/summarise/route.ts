import { NextResponse } from "next/server";
import { StreamingTextResponse } from "ai";
import { summarise } from "@/app/api/ai/summarise/controller";
import { withError } from "@/utils/middleware";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { summariseBody } from "@/app/api/ai/summarise/validation";
import { getSummary, saveSummary } from "@/utils/redis/summary";
import { expire } from "@/utils/redis";
import { emailToContent } from "@/utils/mail";

// doesn't work with parsing email packages we use
// export const runtime = "edge";

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = summariseBody.parse(json);

  const prompt = emailToContent({
    textHtml: body.textHtml || null,
    textPlain: body.textPlain || null,
    snippet: null,
  });

  if (!prompt)
    return NextResponse.json({ error: "No text provided" }, { status: 400 });

  const cachedSummary = await getSummary(prompt);
  if (cachedSummary) return new NextResponse(cachedSummary);

  const stream = await summarise(prompt, {
    userEmail: session.user.email,
    onFinal: async (completion) => {
      await saveSummary(prompt, completion);
      await expire(prompt, 60 * 60 * 24);
    },
  });

  return new StreamingTextResponse(stream);
});
