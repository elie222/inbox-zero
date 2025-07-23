import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export const POST = withError(async (request) => {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid authorization header" },
      { status: 401 },
    );
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  // Find the session token and check if it's valid
  const session = await prisma.extensionSession.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  if (!session) {
    return NextResponse.json(
      { error: "Invalid session token" },
      { status: 401 },
    );
  }

  // Check if the session has expired
  if (session.expiresAt < new Date()) {
    // Clean up expired session
    await prisma.extensionSession.delete({
      where: { id: session.id },
    });

    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  return NextResponse.json({
    valid: true,
    userId: session.user.id,
    email: session.user.email,
  });
});
