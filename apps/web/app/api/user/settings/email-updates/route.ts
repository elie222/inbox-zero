import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import {
  type SaveEmailUpdateSettingsBody,
  saveEmailUpdateSettingsBody,
} from "@/app/api/user/settings/email-updates/validation";

export type SaveEmailUpdateSettingsResponse = Awaited<
  ReturnType<typeof saveEmailUpdateSettings>
>;

async function saveEmailUpdateSettings(
  { email }: { email: string },
  { statsEmailFrequency, summaryEmailFrequency }: SaveEmailUpdateSettingsBody,
) {
  return await prisma.emailAccount.update({
    where: { email },
    data: { statsEmailFrequency, summaryEmailFrequency },
  });
}

export const POST = withAuth(async (request) => {
  const email = request.auth.userEmail;

  const json = await request.json();
  const body = saveEmailUpdateSettingsBody.parse(json);

  const result = await saveEmailUpdateSettings({ email }, body);

  return NextResponse.json(result);
});
