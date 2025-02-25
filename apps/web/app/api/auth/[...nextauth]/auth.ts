import NextAuth from "next-auth";
import { getAuthOptions, authOptions } from "@/utils/auth";
import { createScopedLogger } from "@/utils/logger";
import { cookies, headers } from "next/headers";

const logger = createScopedLogger("Auth API");

export const {
  handlers: { GET, POST },
  auth: originalAuth,
  signOut,
} = NextAuth((req) => {
  try {
    if (req?.url) {
      const url = new URL(req.url);
      const consent = url.searchParams.get("consent");
      if (consent) {
        logger.info("Consent requested");
        return getAuthOptions({ consent: true });
      }
    }

    return authOptions;
  } catch (error) {
    logger.error("Auth configuration error", { error });
    throw error;
  }
});

// Create a wrapper for the auth function to handle account switching
export const auth = async () => {
  // Get the original session
  const session = await originalAuth();

  // If no session, just return it
  if (!session?.user) {
    return session;
  }

  try {
    // Check if there's an active account in headers or cookies
    const headersList = headers();
    const activeAccount =
      headersList.get("x-active-account") ||
      cookies().get("active_account")?.value;

    // If there's no active account or it's the same as the current user, return the original session
    if (!activeAccount || activeAccount === session.user.email) {
      return session;
    }

    // For now, since we don't have a proper model to track connected accounts,
    // we can only use the simplest implementation that allows a user
    // to switch to their own email account
    if (activeAccount !== session.user.email) {
      logger.info("Account switch requested", {
        from: session.user.email,
        to: activeAccount,
      });

      // Update the session with the active account's email
      return {
        ...session,
        user: {
          ...session.user,
          email: activeAccount,
        },
      };
    }

    return session;
  } catch (error) {
    logger.error("Error in auth account switching", { error });
    return session;
  }
};
