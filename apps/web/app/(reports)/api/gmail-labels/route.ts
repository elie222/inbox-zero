import { type NextRequest, NextResponse } from "next/server";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";

export async function POST(request: NextRequest) {
  try {
    const { userEmail } = await request.json();

    if (!userEmail) {
      return NextResponse.json(
        { error: "Email address is required" },
        { status: 400 },
      );
    }

    const emailAccount = await prisma.emailAccount.findFirst({
      where: { user: { email: userEmail } },
      include: { account: true },
    });

    if (!emailAccount) {
      return NextResponse.json(
        { error: "Email account not found" },
        { status: 404 },
      );
    }

    const gmail = await getGmailClientWithRefresh({
      accessToken: emailAccount.account.access_token!,
      refreshToken: emailAccount.account.refresh_token!,
      expiresAt: emailAccount.account.expires_at,
      emailAccountId: emailAccount.id,
    });

    const response = await gmail.users.labels.list({ userId: "me" });

    const userLabels =
      response.data.labels?.filter(
        (label: any) =>
          label.type === "user" &&
          !label.name.startsWith("CATEGORY_") &&
          !label.name.startsWith("CHAT"),
      ) || [];

    const labelsWithCounts = await Promise.all(
      userLabels.map(async (label: any) => {
        try {
          const labelDetail = await gmail.users.labels.get({
            userId: "me",
            id: label.id,
          });
          return {
            ...label,
            messagesTotal: labelDetail.data.messagesTotal || 0,
            messagesUnread: labelDetail.data.messagesUnread || 0,
            threadsTotal: labelDetail.data.threadsTotal || 0,
            threadsUnread: labelDetail.data.threadsUnread || 0,
          };
        } catch (error) {
          console.warn(`Failed to get details for label ${label.name}:`, error);
          return {
            ...label,
            messagesTotal: 0,
            messagesUnread: 0,
            threadsTotal: 0,
            threadsUnread: 0,
          };
        }
      }),
    );

    const sortedLabels = labelsWithCounts.sort(
      (a: any, b: any) => (b.messagesTotal || 0) - (a.messagesTotal || 0),
    );

    return NextResponse.json({
      labels: sortedLabels.map((label: any) => ({
        id: label.id,
        name: label.name,
        messagesTotal: label.messagesTotal || 0,
        messagesUnread: label.messagesUnread || 0,
        color: label.color || null,
        type: label.type,
      })),
      totalLabels: sortedLabels.length,
    });
  } catch (error) {
    console.error("Gmail labels fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Gmail labels" },
      { status: 500 },
    );
  }
}
