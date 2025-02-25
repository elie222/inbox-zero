import { z } from "zod";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("switch-account");

// Request validation schema
const switchAccountSchema = z.object({
  email: z.string().email(),
});

export type SwitchAccountBody = z.infer<typeof switchAccountSchema>;

/**
 * Validates if the user has access to the requested account
 * This is a temporary implementation until we add proper account relationships
 */
async function canAccessAccount(currentUserId: string, targetEmail: string) {
  // Initially, we'll only allow users to switch to their own email
  // Later, we'll implement proper account relationships
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: { email: true },
  });

  return currentUser?.email === targetEmail;
}

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { email } = switchAccountSchema.parse(body);

    // Check if the user can access this account
    const hasAccess = await canAccessAccount(session.user.id, email);
    if (!hasAccess) {
      logger.error("Unauthorized access attempt", {
        userId: session.user.id,
        targetEmail: email,
      });
      return NextResponse.json(
        { error: "You don't have access to this account" },
        { status: 403 },
      );
    }

    // Set a cookie to indicate the active account
    const response = NextResponse.json({ success: true });
    response.cookies.set("active_account", email, {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    logger.info("Account switched", {
      userId: session.user.id,
      to: email,
    });

    return response;
  } catch (error) {
    logger.error("Failed to switch account", { error });
    return NextResponse.json(
      { error: "Failed to switch account" },
      { status: 500 },
    );
  }
});
