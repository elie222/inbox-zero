import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { generateSecureToken } from "@/utils/api-key";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export const POST = withError(async (request) => {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Clean up any existing tokens for this user
  await prisma.extensionSession.deleteMany({
    where: {
      userId: session.user.id,
    },
  });

  // Generate a secure session token
  const sessionToken = generateSecureToken();

  // Store the session token with user info and expiration
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.extensionSession.create({
    data: {
      token: sessionToken,
      userId: session.user.id,
      expiresAt,
    },
  });

  return NextResponse.json({ sessionToken });
});
