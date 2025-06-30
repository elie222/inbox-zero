// based on: https://github.com/vercel/platforms/blob/main/lib/auth.ts
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Prisma } from "@prisma/client";
import type { NextAuthConfig, DefaultSession } from "next-auth";
import { cookies } from "next/headers";
import type { JWT } from "@auth/core/jwt";
import GoogleProvider from "next-auth/providers/google";
import MicrosoftProvider from "next-auth/providers/microsoft-entra-id";
import { createContact as createLoopsContact } from "@inboxzero/loops";
import { createContact as createResendContact } from "@inboxzero/resend";
import prisma from "@/utils/prisma";
import { env } from "@/env";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { SCOPES as GMAIL_SCOPES } from "@/utils/gmail/scopes";
import { SCOPES as OUTLOOK_SCOPES } from "@/utils/outlook/scopes";
import { getContactsClient as getGoogleContactsClient } from "@/utils/gmail/client";
import { getContactsClient as getOutlookContactsClient } from "@/utils/outlook/client";
import { encryptToken } from "@/utils/encryption";
import { updateAccountSeats } from "@/utils/premium/server";
import { createReferral } from "@/utils/referral/referral-code";
import { trackDubSignUp } from "@/utils/dub";

const logger = createScopedLogger("auth");

// Helper function to determine provider-specific logic
const PROVIDER_CONFIG = {
  google: {
    name: "google",
    tokenUrl: "https://oauth2.googleapis.com/token",
    getProfileData: async (accessToken: string) => {
      const contactsClient = getGoogleContactsClient({ accessToken });
      const profileResponse = await contactsClient.people.get({
        resourceName: "people/me",
        personFields: "emailAddresses,names,photos",
      });

      return {
        email: profileResponse.data.emailAddresses
          ?.find((e) => e.metadata?.primary)
          ?.value?.toLowerCase(),
        name: profileResponse.data.names?.find((n) => n.metadata?.primary)
          ?.displayName,
        image: profileResponse.data.photos?.find((p) => p.metadata?.primary)
          ?.url,
      };
    },
  },
  "microsoft-entra-id": {
    name: "microsoft",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    getProfileData: async (accessToken: string) => {
      const client = getOutlookContactsClient({ accessToken });
      try {
        const profileResponse = await client.getUserProfile();
        console.log("profileResponse", profileResponse);

        // Get photo separately as it requires a different endpoint
        let photoUrl = null;
        try {
          const photo = await client.getUserPhoto();
          console.log("photoRESPONSE", photo);
          if (photo) {
            photoUrl = photo;
          }
        } catch (error) {
          logger.info("User has no profile photo", { error });
        }

        return {
          email:
            profileResponse.mail?.toLowerCase() ||
            profileResponse.userPrincipalName?.toLowerCase(),
          name: profileResponse.displayName,
          image: photoUrl,
        };
      } catch (error) {
        logger.error("Error fetching Microsoft profile data", { error });
        throw error;
      }
    },
  },
} as const;

export const getAuthOptions: (options?: {
  consent: boolean;
}) => NextAuthConfig = (options) => ({
  debug: false,
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        url: "https://accounts.google.com/o/oauth2/v2/auth",
        params: {
          scope: GMAIL_SCOPES.join(" "),
          access_type: "offline",
          response_type: "code",
          prompt: "consent",
          include_granted_scopes: true,
          // when we don't have the refresh token
          // refresh token is only provided on first sign up unless we pass prompt=consent
          // https://github.com/nextauthjs/next-auth/issues/269#issuecomment-644274504
          // ...(options?.consent ? { prompt: "consent" } : {}),
        },
      },
    }),
    MicrosoftProvider({
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      authorization: {
        params: {
          scope: OUTLOOK_SCOPES.join(" "),
        },
      },
    }),
  ],
  // logger: {
  //   error: (error) => {
  //     logger.error(error.message, { error });
  //   },
  //   warn: (message) => {
  //     logger.warn(message);
  //   },
  //   debug: (message, metadata) => {
  //     logger.info(message, { metadata });
  //   },
  // },
  adapter: {
    ...PrismaAdapter(prisma),
    linkAccount: async (data): Promise<void> => {
      logger.info("[linkAccount] Received data:", {
        provider: data.provider,
        providerAccountId: data.providerAccountId,
        userId: data.userId,
      });
      const { profile, ...accountData } = data;

      let primaryEmail: string | null | undefined;
      let primaryName: string | null | undefined;
      let primaryPhotoUrl: string | null | undefined;

      try {
        // --- Step 1: Fetch Profile Info using Access Token ---
        if (data.access_token) {
          const provider =
            PROVIDER_CONFIG[data.provider as keyof typeof PROVIDER_CONFIG];
          const profileData = await provider.getProfileData(data.access_token);

          primaryEmail = profileData.email;
          primaryName = profileData.name;
          primaryPhotoUrl = profileData.image;
        } else {
          logger.error(
            "[linkAccount] No access_token found in data, cannot fetch profile.",
          );
          throw new Error("Missing access token during account linking.");
        }

        if (!primaryEmail) {
          logger.error(
            "[linkAccount] Primary email could not be determined from profile.",
          );
          throw new Error("Primary email not found for linked account.");
        }

        // --- Step 2: Create the Account record ---
        const createdAccount = await prisma.account.create({
          data: accountData,
          select: { id: true, userId: true },
        });

        // --- Step 3: Create/Update the corresponding EmailAccount record ---
        const userId = createdAccount.userId;
        const emailAccountData: Prisma.EmailAccountUpsertArgs = {
          where: { email: primaryEmail },
          update: {
            userId,
            accountId: createdAccount.id,
            name: primaryName,
            image: primaryPhotoUrl,
          },
          create: {
            email: primaryEmail,
            userId,
            accountId: createdAccount.id,
            name: primaryName,
            image: primaryPhotoUrl,
          },
        };
        await prisma.emailAccount.upsert(emailAccountData);

        // Handle premium account seats
        await updateAccountSeats({ userId }).catch((error) => {
          logger.error("[linkAccount] Error updating premium account seats:", {
            userId: data?.userId,
            error,
          });
          captureException(error, { extra: { userId: data?.userId } });
        });
      } catch (error) {
        logger.error("[linkAccount] Error during linking process:", {
          userId: data?.userId,
          error,
        });
        captureException(error, {
          extra: { userId: data?.userId, location: "linkAccount" },
        });
        throw error; // Re-throw the error so NextAuth knows it failed
      }
    },
  },
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
          await saveTokens({
            tokens: {
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expires_at: calculateExpiresAt(
                account.expires_in as number | undefined,
              ),
            },
            accountRefreshToken: account.refresh_token,
            providerAccountId: account.providerAccountId,
            provider: account.provider,
          });
          token.refresh_token = account.refresh_token;
        } else {
          const dbAccount = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                providerAccountId: account.providerAccountId,
                provider: account.provider,
              },
            },
            select: { refresh_token: true },
          });
          token.refresh_token = dbAccount?.refresh_token ?? undefined;
        }

        token.access_token = account.access_token;
        token.expires_at = account.expires_at;
        token.user = user;
        token.provider = account.provider;

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
        const [loopsResult, resendResult, dubResult] = await Promise.allSettled(
          [
            createLoopsContact(user.email, user.name?.split(" ")?.[0]),
            createResendContact({ email: user.email }),
            trackDubSignUp(user),
          ],
        );

        if (loopsResult.status === "rejected") {
          const alreadyExists =
            loopsResult.reason instanceof Error &&
            loopsResult.reason.message.includes("409");

          if (!alreadyExists) {
            logger.error("Error creating Loops contact", {
              email: user.email,
              error: loopsResult.reason,
            });
            captureException(loopsResult.reason, undefined, user.email);
          }
        }

        if (resendResult.status === "rejected") {
          logger.error("Error creating Resend contact", {
            email: user.email,
            error: resendResult.reason,
          });
          captureException(resendResult.reason, undefined, user.email);
        }

        if (dubResult.status === "rejected") {
          logger.error("Error tracking Dub sign up", {
            email: user.email,
            error: dubResult.reason,
          });
          captureException(dubResult.reason, undefined, user.email);
        }
      }

      if (isNewUser && user.email && user.id) {
        await Promise.all([
          handlePendingPremiumInvite({ email: user.email }),
          handleReferralOnSignUp({
            userId: user.id,
            email: user.email,
          }),
        ]);
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
    where: { userId: token.sub as string, provider: token.provider },
    select: {
      userId: true,
      refresh_token: true,
      providerAccountId: true,
      provider: true,
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
      providerAccountId: account.providerAccountId,
    });
    return {
      ...token,
      error: "RequiresReconsent",
    };
  }

  const provider =
    PROVIDER_CONFIG[account.provider as keyof typeof PROVIDER_CONFIG];

  try {
    const response = await fetch(provider.tokenUrl, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:
          account.provider === "google"
            ? env.GOOGLE_CLIENT_ID
            : env.MICROSOFT_CLIENT_ID!,
        client_secret:
          account.provider === "google"
            ? env.GOOGLE_CLIENT_SECRET
            : env.MICROSOFT_CLIENT_SECRET!,
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

    await saveTokens({
      tokens: { ...tokens, expires_at },
      accountRefreshToken: account.refresh_token,
      providerAccountId: account.providerAccountId,
      provider: account.provider,
    });

    return {
      ...token, // Keep the previous token properties
      access_token: tokens.access_token,
      expires_at,
      // Fall back to old refresh token, but note that
      // many providers may only allow using a refresh token once.
      refresh_token: tokens.refresh_token ?? token.refresh_token,
      error: undefined,
      provider: account.provider,
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

export async function saveTokens({
  tokens,
  accountRefreshToken,
  providerAccountId,
  emailAccountId,
  provider = "google",
}: {
  tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  };
  accountRefreshToken: string | null;
  provider?: string;
} & ( // provide one of these:
  | {
      providerAccountId: string;
      emailAccountId?: never;
    }
  | {
      emailAccountId: string;
      providerAccountId?: never;
    }
)) {
  const refreshToken = tokens.refresh_token ?? accountRefreshToken;

  if (!refreshToken) {
    logger.error("Attempted to save null refresh token", { providerAccountId });
    captureException("Cannot save null refresh token", {
      extra: { providerAccountId },
    });
    return;
  }

  const data = {
    access_token: tokens.access_token,
    expires_at: tokens.expires_at,
    refresh_token: refreshToken,
  };

  if (emailAccountId) {
    // Encrypt tokens in data directly
    // Usually we do this in prisma-extensions.ts but we need to do it here because we're updating the account via the emailAccount
    // We could also edit prisma-extensions.ts to handle this case but this is easier for now
    if (data.access_token)
      data.access_token = encryptToken(data.access_token) || undefined;
    if (data.refresh_token)
      data.refresh_token = encryptToken(data.refresh_token) || "";

    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { account: { update: data } },
    });
  } else {
    if (!providerAccountId) {
      logger.error("No providerAccountId found in database", {
        emailAccountId,
      });
      captureException("No providerAccountId found in database", {
        extra: { emailAccountId },
      });
      return;
    }

    return await prisma.account.update({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      data,
    });
  }
}

async function handlePendingPremiumInvite({ email }: { email: string }) {
  logger.info("Handling pending premium invite", { email });

  // Check for pending invite
  const premium = await prisma.premium.findFirst({
    where: { pendingInvites: { has: email } },
    select: {
      id: true,
      pendingInvites: true,
      lemonSqueezySubscriptionItemId: true,
      stripeSubscriptionId: true,
      _count: { select: { users: true } },
    },
  });

  if (
    premium?.lemonSqueezySubscriptionItemId ||
    premium?.stripeSubscriptionId
  ) {
    // Add user to premium and remove from pending invites
    await prisma.premium.update({
      where: { id: premium.id },
      data: {
        users: { connect: { email } },
        pendingInvites: {
          set: premium.pendingInvites.filter((e) => e !== email),
        },
      },
    });
  }

  logger.info("Added user to premium from invite", { email });
}

export async function handleReferralOnSignUp({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  try {
    const cookieStore = await cookies();
    const referralCookie = cookieStore.get("referral_code");

    if (!referralCookie?.value) {
      logger.info("No referral code found in cookies", { email });
      return;
    }

    const referralCode = referralCookie.value;
    logger.info("Processing referral for new user", {
      email,
      referralCode,
    });

    await createReferral(userId, referralCode);
    logger.info("Successfully created referral", {
      email,
      referralCode,
    });
  } catch (error) {
    logger.error("Error processing referral on sign up", {
      error,
      userId,
      email,
    });
    // Don't throw error - referral failure shouldn't prevent sign up
    captureException(error, {
      extra: { userId, email, location: "handleReferralOnSignUp" },
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
    provider?: string;
    error?:
      | "RefreshAccessTokenError"
      | "MissingAccountError"
      | "RequiresReconsent";
  }
}
