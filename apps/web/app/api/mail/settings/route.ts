import { getMailSettings } from "@/utils/split-inbox/settings.server";
import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";

export type MailSettingsResponse = Awaited<ReturnType<typeof getMailSettings>>;

export const GET = withEmailAccount("mail/settings", async (request) => {
  const { emailAccountId } = request.auth;

  try {
    const result = await getMailSettings({ emailAccountId });
    return NextResponse.json(result);
  } catch (error) {
    request.logger.error("Error fetching mail settings", { error });
    return NextResponse.json(
      { error: "Failed to fetch mail settings" },
      { status: 500 },
    );
  }
});
