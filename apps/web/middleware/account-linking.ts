import { type NextRequest, NextResponse } from "next/server";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("account-linking-middleware");

/**
 * This middleware handles the OAuth callback for account linking
 * It reads the special cookies we set to track the original user
 * and links the new account to that user
 */
export async function accountLinkingMiddleware(
  req: NextRequest,
): Promise<NextResponse | undefined> {
  // Only run this middleware on the callback URL with the account linking parameter
  const url = new URL(req.url);

  // Check if this is an OAuth callback and we're in the linking flow
  if (
    url.pathname.startsWith("/api/auth/callback/google") &&
    req.cookies.has("link_account") &&
    req.cookies.has("original_user_id")
  ) {
    const originalUserId = req.cookies.get("original_user_id")?.value;

    if (!originalUserId) {
      logger.error("Missing original user ID for account linking");
      return;
    }

    // We need to store this information so it can be accessed in the OAuth flow
    // Later, we'll check for these special cookies in our accountLinkingHandler
    // which will be executed after the OAuth flow completes
    logger.info("Account linking in progress", { originalUserId });

    // Store the linking information in request headers that will be accessible in the route handler
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-link-account", "true");
    requestHeaders.set("x-original-user-id", originalUserId);

    // Return the response with the updated headers
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}
