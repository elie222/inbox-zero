import { NextResponse, type NextRequest } from "next/server";
import { accountSwitcherMiddleware } from "./middleware/account-switcher";
import { accountLinkingMiddleware } from "./middleware/account-linking";

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};

export async function middleware(request: NextRequest) {
  // Apply the account linking middleware first (only runs on specific routes)
  const linkingResponse = await accountLinkingMiddleware(request);
  if (linkingResponse) return linkingResponse;

  // Apply the account switcher middleware next
  const response = await accountSwitcherMiddleware(
    request,
    NextResponse.next(),
  );

  return response;
}
