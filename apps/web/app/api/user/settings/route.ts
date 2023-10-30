import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import {
  SaveSettingsBody,
  saveSettingsBody,
} from "@/app/api/user/settings/validation";

export type SaveSettingsResponse = Awaited<ReturnType<typeof saveAISettings>>;

async function saveAISettings(options: SaveSettingsBody) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  return await prisma.user.update({
    where: { email: session.user.email },
    data: {
      aiModel: options.aiModel,
      openAIApiKey: options.openAIApiKey || null,
    },
  });
}

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = saveSettingsBody.parse(json);

  const result = await saveAISettings(body);

  return NextResponse.json(result);
});
