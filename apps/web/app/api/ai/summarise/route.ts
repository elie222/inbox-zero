import { NextResponse } from "next/server";
import { summarise } from "@/app/api/ai/summarise/controller";
import { withEmailAccount } from "@/utils/middleware";
import { summariseBody } from "@/app/api/ai/summarise/validation";
import { getSummary } from "@/utils/redis/summary";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { emailToContentForAI } from "@/utils/ai/content-sanitizer";

export const POST = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const json = await request.json();
  const body = summariseBody.parse(json);

  const prompt = emailToContentForAI({
    textHtml: body.textHtml || undefined,
    textPlain: body.textPlain || undefined,
    snippet: "",
  });

  if (!prompt)
    return NextResponse.json({ error: "No text provided" }, { status: 400 });

  const cachedSummary = await getSummary(prompt);
  if (cachedSummary) return new NextResponse(cachedSummary);

  const userAi = await getEmailAccountWithAi({ emailAccountId });

  if (!userAi)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const stream = await summarise({
    text: prompt,
    userEmail: userAi.email,
    userAi,
  });

  return stream.toTextStreamResponse();
});
