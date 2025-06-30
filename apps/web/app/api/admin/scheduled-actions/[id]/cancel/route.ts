import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { ScheduledActionStatus } from "@prisma/client";
import { isAdmin } from "@/utils/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin({ email: session.user.email })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const scheduledAction = await prisma.scheduledAction.findUnique({
      where: { id },
    });

    if (!scheduledAction) {
      return NextResponse.json(
        { error: "Scheduled action not found" },
        { status: 404 },
      );
    }

    if (scheduledAction.status !== ScheduledActionStatus.PENDING) {
      return NextResponse.json(
        { error: "Can only cancel pending actions" },
        { status: 400 },
      );
    }

    await prisma.scheduledAction.update({
      where: { id },
      data: {
        status: ScheduledActionStatus.CANCELLED,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error cancelling scheduled action:", error);
    return NextResponse.json(
      { error: "Failed to cancel scheduled action" },
      { status: 500 },
    );
  }
}
