import { type NextRequest, NextResponse } from "next/server";

/**
 * This middleware reads the active_account cookie and adds it to the request headers
 * so it can be used in server components and API routes to determine the active account
 */
export async function accountSwitcherMiddleware(
  req: NextRequest,
  res: NextResponse,
) {
  // Get active account from cookies
  const activeAccount = req.cookies.get("active_account")?.value;

  // If there's an active account cookie, add it to request headers
  if (activeAccount) {
    // Clone the headers so they can be modified
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-active-account", activeAccount);

    // Return the response with updated headers
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // If no active account is set, just continue
  return NextResponse.next();
}
