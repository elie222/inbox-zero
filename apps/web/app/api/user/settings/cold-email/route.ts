import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import {
  UpdateColdEmailSettingsBody,
  updateColdEmailSettingsBody,
} from "@/app/api/user/settings/cold-email/validation";

export type UpdateColdEmailSettingsResponse = Awaited<
  ReturnType<typeof updateColdEmailSettings>
>;

async function updateColdEmailSettings(options: UpdateColdEmailSettingsBody) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  return await prisma.user.update({
    where: { email: session.user.email },
    data: {
      coldEmailBlocker: options.coldEmailBlocker,
      coldEmailPrompt: options.coldEmailPrompt,
    },
  });
}

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = updateColdEmailSettingsBody.parse(json);

  const result = await updateColdEmailSettings(body);

  return NextResponse.json(result);
});
