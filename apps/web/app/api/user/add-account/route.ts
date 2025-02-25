import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("add-account");

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Set cookies that will be used by the OAuth callback to link the account
    const response = NextResponse.json({
      success: true,
      // Return the Google OAuth URL with special parameters
      authUrl: `/api/auth/signin/google?callbackUrl=${encodeURIComponent("/settings?account_linked=true")}&link_account=true`,
    });

    // Store the current user's ID in a cookie that will be read during the OAuth callback
    response.cookies.set("link_account", "true", {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 5, // 5 minutes
    });

    response.cookies.set("original_user_id", session.user.id, {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 5, // 5 minutes
    });

    logger.info("Starting account linking flow", { userId: session.user.id });
    return response;
  } catch (error) {
    logger.error("Failed to start account linking", { error });
    return NextResponse.json(
      { error: "Failed to start account linking" },
      { status: 500 },
    );
  }
});
