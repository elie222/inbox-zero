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

  const userFrequency = await prisma.userFrequency.findUnique({
    where: { id },
  });

  if (!userFrequency) {
    return NextResponse.json(
      { error: "User frequency not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(userFrequency);
});
