/**
 * Client-side utility for handling auth-related cookies
 * This file should NOT import any server-side dependencies (prisma, env, etc.)
 */

/**
 * Get and clear auth error cookie set during account linking
 * Used on client side to retrieve error information from cookie
 */
export function getAndClearAuthErrorCookie(): string | undefined {
  const authErrorCookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("auth_error="))
    ?.split("=")
    .slice(1)
    .join("=");

  if (authErrorCookie) {
    document.cookie = "auth_error=; path=/; max-age=0";
  }

  return authErrorCookie;
}
