import { NextResponse } from "next/server";
import { summarise } from "@/app/api/ai/summarise/controller";
import { withAuth } from "@/utils/middleware";
import { summariseBody } from "@/app/api/ai/summarise/validation";
import { getSummary } from "@/utils/redis/summary";
import { emailToContent } from "@/utils/mail";
import { getAiUser } from "@/utils/user/get";

export const POST = withAuth(async (request) => {
  const email = request.auth.userEmail;

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

  const userAi = await getAiUser({ email });

  if (!userAi)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const stream = await summarise(prompt, email, userAi);

  return stream.toTextStreamResponse();
});
