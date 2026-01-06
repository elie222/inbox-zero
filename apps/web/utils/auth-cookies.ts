export function getAndClearAuthErrorCookie(): string | undefined {
  const authErrorCookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("auth_error="))
    ?.split("=")
    .slice(1)
    .join("=");

  if (authErrorCookie) {
    document.cookie = "auth_error=; path=/; max-age=0; SameSite=Lax; Secure";
  }

  return authErrorCookie;
}
