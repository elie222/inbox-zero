import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { plan, planBody } from "@/app/api/ai/plan/controller";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { AIModel } from "@/utils/openai";

// Next Auth does not support edge runtime but will do soon:
// https://github.com/vercel/next.js/issues/50444#issuecomment-1602746782
// export const runtime = "edge";

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json();
  const body = planBody.parse(json);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      aiModel: true,
      openAIApiKey: true,
    },
  });

  const res = await plan(body, {
    ...session.user,
    email: session.user.email,
    aiModel: user.aiModel as AIModel,
    openAIApiKey: user.openAIApiKey,
  });

  return NextResponse.json(res);
});
