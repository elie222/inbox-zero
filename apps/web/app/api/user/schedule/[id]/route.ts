import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export const GET = withEmailAccount(
  async (request, { params }: { params: Promise<{ id?: string }> }) => {
    const emailAccountId = request.auth.emailAccountId;
    const { id } = await params;
    if (!id)
      return NextResponse.json(
        { error: "Missing schedule id" },
        { status: 400 },
      );

    const schedule = await prisma.schedule.findUnique({
      where: { id, emailAccountId },
    });

    if (!schedule) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(schedule);
  },
);
