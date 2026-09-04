import { NextResponse } from "next/server";
import { createEmailProvider } from "@/utils/email/provider";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { getEmailAccount } from "@/utils/redis/account-validation";
import { getEmailDraftUrl } from "@/utils/url";

export const GET = withAuth(
  "user/meeting-recorder/meeting-draft",
  async (request, { params }) => {
    const { meetingId } = await params;
    const emailAccountId = request.nextUrl.searchParams.get("emailAccountId");

    if (!emailAccountId) {
      return NextResponse.json(
        { error: "Email account ID is required." },
        { status: 400 },
      );
    }

    const email = await getEmailAccount({
      userId: request.auth.userId,
      emailAccountId,
    });

    if (!email) {
      return NextResponse.json(
        { error: "Invalid account ID" },
        { status: 403 },
      );
    }

    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, emailAccountId },
      select: {
        followUpDraftId: true,
        emailAccount: { select: { account: { select: { provider: true } } } },
      },
    });

    if (!meeting?.followUpDraftId) return draftNotFound();

    const provider = meeting.emailAccount.account.provider;
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger: request.logger,
    });
    const draft = await emailProvider.getDraft(meeting.followUpDraftId);

    if (!draft) return draftNotFound();

    return NextResponse.redirect(getEmailDraftUrl(draft, email, provider));
  },
);

function draftNotFound() {
  return NextResponse.json(
    { error: "Meeting follow-up draft not found." },
    { status: 404 },
  );
}
