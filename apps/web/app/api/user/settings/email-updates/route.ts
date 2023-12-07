import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import {
  SaveEmailUpdateSettingsBody,
  saveEmailUpdateSettingsBody,
} from "@/app/api/user/settings/email-updates/validation";

export type SaveEmailUpdateSettingsResponse = Awaited<
  ReturnType<typeof saveEmailUpdateSettings>
>;

async function saveEmailUpdateSettings(options: SaveEmailUpdateSettingsBody) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  return await prisma.user.update({
    where: { email: session.user.email },
    data: {
      statsEmailFrequency: options.statsEmailFrequency,
    },
  });
}

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = saveEmailUpdateSettingsBody.parse(json);

  const result = await saveEmailUpdateSettings(body);

  return NextResponse.json(result);
});
