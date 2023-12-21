// based on: https://github.com/vercel/platforms/blob/main/lib/auth.ts
import { PrismaAdapter } from "@auth/prisma-adapter";
import { type NextAuthConfig, type DefaultSession, Account } from "next-auth";
import { type JWT } from "@auth/core/jwt";
import GoogleProvider from "next-auth/providers/google";
import { createContact } from "@inboxzero/loops";
import prisma from "@/utils/prisma";
import { env } from "@/env.mjs";

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",

  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  // "https://www.googleapis.com/auth/contacts",
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
          console.log("Saving refresh token", token.email);
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
      } else if (
        token.expires_at &&
        Date.now() < (token.expires_at as number) * 1000
      ) {
        // If the access token has not expired yet, return it
        return token;
      } else {
        // If the access token has expired, try to refresh it
        console.log(
          `Token expired at: ${token.expires_at}. Attempting refresh.`,
        );
        return await refreshAccessToken(token);
      }
    },
    session: async ({ session, token }) => {
      session.user = {
        ...session.user,
        id: token.sub as string,
      };

      // based on: https://github.com/nextauthjs/next-auth/issues/1162#issuecomment-766331341
      session.accessToken = token?.access_token as string | undefined;
      session.error = token?.error as string | undefined;

      if (session.error) console.error("session.error", session.error);

      return session;
    },
  },
  events: {
    signIn: async ({ isNewUser, user }) => {
      if (isNewUser && user.email) {
        await createContact(user.email);
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
  });

  if (!account?.refresh_token) {
    console.error("No refresh token found in database for", account?.userId);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }

  console.log("Refreshing access token for", token.email);

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
    console.error("Error refreshing access token", error);

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
  return await prisma.account.update({
    data: {
      access_token: tokens.access_token,
      expires_at: tokens.expires_at,
      refresh_token: tokens.refresh_token ?? account.refresh_token,
    },
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: account.providerAccountId,
      },
    },
  });
}

// export function getAuthSession() {
//   return auth(authOptions) as Promise<{
//     user: {
//       id: string;
//       name: string;
//       email: string;
//       image: string;
//     };
//     accessToken?: string;
//   } | null>;
// }

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
    error?: "RefreshAccessTokenError";
  }
}
