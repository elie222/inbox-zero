import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { categorise } from "@/app/api/ai/categorise/controller";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { categoriseBodyWithHtml } from "@/app/api/ai/categorise/validation";
import { parseEmail } from "@/utils/mail";
import prisma from "@/utils/prisma";
import { AIModel } from "@/utils/openai";

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = categoriseBodyWithHtml.parse(json);

  const content =
    parseEmail(body.textHtml || "") || body.textPlain || body.snippet || "";

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      aiModel: true,
      openAIApiKey: true,
    },
  });

  const res = await categorise(
    {
      ...body,
      content,
      openAIApiKey: user.openAIApiKey,
      aiModel: user.aiModel as AIModel,
    },
    { email: session.user.email }
  );

  return NextResponse.json(res);
});
