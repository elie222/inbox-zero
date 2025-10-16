import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import type { EmailProvider } from "@/utils/email/types";

export type GetFoldersResponse = Awaited<ReturnType<typeof getFolders>>;

export const GET = withEmailProvider(async (request) => {
  const emailProvider = request.emailProvider;

  if (!isMicrosoftProvider(emailProvider.name)) {
    return NextResponse.json(
      { error: "Only Microsoft email providers are supported" },
      { status: 400 },
    );
  }

  const result = await getFolders({ emailProvider });
  return NextResponse.json(result);
});

async function getFolders({ emailProvider }: { emailProvider: EmailProvider }) {
  const folders = await emailProvider.getFolders();
  return folders;
}
