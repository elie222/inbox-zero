import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export const GET = withError(async (request, { params }) => {
  const { id } = await params;
  if (!id)
    return NextResponse.json(
      { error: "Missing frequency id" },
      { status: 400 },
    );

  const schedule = await prisma.schedule.findUnique({
    where: { id },
  });

  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  return NextResponse.json(schedule);
});
