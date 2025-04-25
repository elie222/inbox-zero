import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import {
  type SaveEmailUpdateSettingsBody,
  saveEmailUpdateSettingsBody,
} from "@/app/api/user/settings/email-updates/validation";

export type SaveEmailUpdateSettingsResponse = Awaited<
  ReturnType<typeof saveEmailUpdateSettings>
>;

async function saveEmailUpdateSettings(
  { emailAccountId }: { emailAccountId: string },
  { statsEmailFrequency, summaryEmailFrequency }: SaveEmailUpdateSettingsBody,
) {
  return await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: { statsEmailFrequency, summaryEmailFrequency },
  });
}

export const POST = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const json = await request.json();
  const body = saveEmailUpdateSettingsBody.parse(json);

  const result = await saveEmailUpdateSettings({ emailAccountId }, body);

  return NextResponse.json(result);
});
