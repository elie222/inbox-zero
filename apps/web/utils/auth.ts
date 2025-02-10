// based on: https://github.com/vercel/platforms/blob/main/lib/auth.ts
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig, DefaultSession, Account } from "next-auth";
import type { JWT } from "@auth/core/jwt";
import GoogleProvider from "next-auth/providers/google";
import { createContact as createLoopsContact } from "@inboxzero/loops";
import { createContact as createResendContact } from "@inboxzero/resend";
import prisma from "@/utils/prisma";
import { env } from "@/env";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("auth");

export const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",

  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  ...(env.NEXT_PUBLIC_CONTACTS_ENABLED
    ? ["https://www.googleapis.com/auth/contacts"]
    : []),
];

export const getAuthOptions: (options?: {
  consent: boolean;
}) => NextAuthConfig = (options) => ({
  // debug: true,
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        url: "https://accounts.google.com/o/oauth2/v2/auth",
        params: {
          scope: SCOPES.join(" "),
          access_type: "offline",
          response_type: "code",
          // when we don't have the refresh token
          // refresh token is only provided on first sign up unless we pass prompt=consent
          // https://github.com/nextauthjs/next-auth/issues/269#issuecomment-644274504
          ...(options?.consent ? { prompt: "consent" } : {}),
        },
      },
    }),
  ],
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  // based on: https://authjs.dev/guides/basics/refresh-token-rotation
  // and: https://github.com/nextauthjs/next-auth-refresh-token-example/blob/main/pages/api/auth/%5B...nextauth%5D.js
  callbacks: {
    jwt: async ({ token, user, account }): Promise<JWT> => {
      // Signing in
      // on first sign in `account` and `user` are defined, thereafter only `token` is defined
      if (account && user) {
        // Google sends us `refresh_token` only on first sign in so we need to save it to the database then
        // On future log ins, we retrieve the `refresh_token` from the database
        if (account.refresh_token) {
          logger.info("Saving refresh token", { email: token.email });
          await saveRefreshToken(
            {
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expires_at: calculateExpiresAt(
                account.expires_in as number | undefined,
              ),
            },
            {
              providerAccountId: account.providerAccountId,
              refresh_token: account.refresh_token,
            },
          );
          token.refresh_token = account.refresh_token;
        } else {
          const dbAccount = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                providerAccountId: account.providerAccountId,
                provider: "google",
              },
            },
            select: { refresh_token: true },
          });
          token.refresh_token = dbAccount?.refresh_token ?? undefined;
        }

        token.access_token = account.access_token;
        token.expires_at = account.expires_at;
        token.user = user;

        return token;
      }

      // logger.info("JWT callback - current token state", {
      //   email: token.email,
      //   currentExpiresAt: token.expires_at
      //     ? new Date((token.expires_at as number) * 1000).toISOString()
      //     : "not set",
      // });

      if (
        token.expires_at &&
        Date.now() < (token.expires_at as number) * 1000
      ) {
        // // If the access token has not expired yet, return it
        // logger.info("Token still valid", {
        //   email: token.email,
        //   expiresIn:
        //     ((token.expires_at as number) * 1000 - Date.now()) / 1000 / 60,
        //   minutes: true,
        // });
        return token;
      }

      // If the access token has expired, try to refresh it
      logger.info("Token expired at", {
        email: token.email,
        expiresAt: token.expires_at
          ? new Date((token.expires_at as number) * 1000).toISOString()
          : "not set",
      });
      const refreshedToken = await refreshAccessToken(token);
      logger.info("Refresh attempt completed", {
        email: token.email,
        newExpiration: refreshedToken.expires_at
          ? new Date(refreshedToken.expires_at * 1000).toISOString()
          : "undefined",
      });
      return refreshedToken;
    },
    session: async ({ session, token }) => {
      session.user = {
        ...session.user,
        id: token.sub as string,
      };

      // based on: https://github.com/nextauthjs/next-auth/issues/1162#issuecomment-766331341
      session.accessToken = token?.access_token as string | undefined;
      session.error = token?.error as string | undefined;

      if (session.error) {
        logger.error("session.error", {
          email: token.email,
          error: session.error,
        });
      }

      return session;
    },
  },
  events: {
    signIn: async ({ isNewUser, user }) => {
      if (isNewUser && user.email) {
        const [loopsResult, resendResult] = await Promise.allSettled([
          createLoopsContact(user.email, user.name?.split(" ")?.[0]),
          createResendContact({ email: user.email }),
        ]);

        if (loopsResult.status === "rejected") {
          logger.error("Error creating Loops contact", {
            email: user.email,
            error: loopsResult.reason,
          });
          captureException(loopsResult.reason, undefined, user.email);
        }

        if (resendResult.status === "rejected") {
          logger.error("Error creating Resend contact", {
            email: user.email,
            error: resendResult.reason,
          });
          captureException(resendResult.reason, undefined, user.email);
        }
      }

      if (isNewUser && user.email) {
        logger.info("Handling pending premium invite", { email: user.email });
        await handlePendingPremiumInvite({ email: user.email });
        logger.info("Added user to premium from invite", { email: user.email });
      }
    },
  },
  pages: {
    signIn: "/login",
    error: "/login/error",
  },
});

export const authOptions = getAuthOptions();

/**
 * Takes a token, and returns a new token with updated
 * `access_token` and `expires_at`. If an error occurs,
 * returns the old token and an error property
 */
const refreshAccessToken = async (token: JWT): Promise<JWT> => {
  const account = await prisma.account.findFirst({
    where: { userId: token.sub as string, provider: "google" },
    select: {
      userId: true,
      refresh_token: true,
      providerAccountId: true,
    },
  });

  if (!account) {
    logger.error("No account found in database", { email: token.email });
    return { error: "MissingAccountError" };
  }

  if (!account?.refresh_token) {
    logger.error("No refresh token found in database", {
      email: token.email,
      userId: account.userId,
    });
    return {
      ...token,
      error: "RequiresReconsent",
    };
  }

  logger.info("Refreshing access token", { email: token.email });

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
      }),
      method: "POST",
    });

    const tokens: {
      expires_in: number;
      access_token: string;
      refresh_token: string;
    } = await response.json();

    if (!response.ok) throw tokens;

    const expires_at = calculateExpiresAt(tokens.expires_in);
    logger.info("New token expires at", {
      email: token.email,
      expiresAt: expires_at
        ? new Date(expires_at * 1000).toISOString()
        : "undefined",
    });

    await saveRefreshToken(
      { ...tokens, expires_at },
      {
        providerAccountId: account.providerAccountId,
        refresh_token: account.refresh_token,
      },
    );

    return {
      ...token, // Keep the previous token properties
      access_token: tokens.access_token,
      expires_at,
      // Fall back to old refresh token, but note that
      // many providers may only allow using a refresh token once.
      refresh_token: tokens.refresh_token ?? token.refresh_token,
      error: undefined,
    };
  } catch (error) {
    logger.error("Error refreshing access token", {
      email: token.email,
      error,
    });

    // The error property will be used client-side to handle the refresh token error
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
};

function calculateExpiresAt(expiresIn?: number) {
  if (!expiresIn) return undefined;
  return Math.floor(Date.now() / 1000 + (expiresIn - 10)); // give 10 second buffer
}

export async function saveRefreshToken(
  tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  },
  account: Pick<Account, "refresh_token" | "providerAccountId">,
) {
  const refreshToken = tokens.refresh_token ?? account.refresh_token;

  if (!refreshToken) {
    logger.error("Attempted to save null refresh token", {
      providerAccountId: account.providerAccountId,
    });
    captureException("Cannot save null refresh token", {
      extra: { providerAccountId: account.providerAccountId },
    });
    return;
  }

  return await prisma.account.update({
    data: {
      access_token: tokens.access_token,
      expires_at: tokens.expires_at,
      refresh_token: refreshToken,
    },
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: account.providerAccountId,
      },
    },
  });
}

async function handlePendingPremiumInvite(user: { email: string }) {
  // Check for pending invite
  const premium = await prisma.premium.findFirst({
    where: { pendingInvites: { has: user.email } },
    select: {
      id: true,
      pendingInvites: true,
      lemonSqueezySubscriptionItemId: true,
      _count: { select: { users: true } },
    },
  });

  if (premium?.lemonSqueezySubscriptionItemId) {
    // Add user to premium and remove from pending invites
    await prisma.premium.update({
      where: { id: premium.id },
      data: {
        users: { connect: { email: user.email } },
        pendingInvites: {
          set: premium.pendingInvites.filter((email) => email !== user.email),
        },
      },
    });
  }
}

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {} & DefaultSession["user"] & { id: string };
    accessToken?: string;
    error?: string | "RefreshAccessTokenError";
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    access_token?: string;
    expires_at?: number;
    refresh_token?: string;
    error?:
      | "RefreshAccessTokenError"
      | "MissingAccountError"
      | "RequiresReconsent";
  }
}
