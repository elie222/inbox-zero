import { NextResponse } from "next/server";
import { summarise } from "@/app/api/ai/summarise/controller";
import { withError } from "@/utils/middleware";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { summariseBody } from "@/app/api/ai/summarise/validation";
import { getSummary } from "@/utils/redis/summary";
import { emailToContent } from "@/utils/mail";
import prisma from "@/utils/prisma";

// doesn't work with parsing email packages we use
// export const runtime = "edge";

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = summariseBody.parse(json);

  const prompt = emailToContent({
    textHtml: body.textHtml || undefined,
    textPlain: body.textPlain || undefined,
    snippet: "",
  });

  if (!prompt)
    return NextResponse.json({ error: "No text provided" }, { status: 400 });

  const cachedSummary = await getSummary(prompt);
  if (cachedSummary) return new NextResponse(cachedSummary);

  const userAi = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { aiProvider: true, aiModel: true, aiApiKey: true },
  });

  if (!userAi)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const stream = await summarise(prompt, session.user.email, userAi);

  return stream.toTextStreamResponse();
});
