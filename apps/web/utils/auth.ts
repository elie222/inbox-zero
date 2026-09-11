import { INITIAL_MAIL_SPLITS } from "@/utils/mail/initial-splits";
import { sso } from "@better-auth/sso";
import { scim } from "@better-auth/scim";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { oAuthProxy } from "better-auth/plugins";
import { createContact as createLoopsContact } from "@inboxzero/loops";
import { createContact as createResendContact } from "@inboxzero/transactional-email";
import type { Account } from "better-auth";
import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { renameGoogleEmail } from "@/utils/auth/rename-email";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { env } from "@/env";
import {
  assertAllowedAuthSignupEmail,
  isAllowedAuthSignupEmail,
} from "@/utils/auth-signup-policy";
import { trackDubSignUp } from "@/utils/dub";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";
import { captureException } from "@/utils/error";
import { SCOPES as GMAIL_SCOPES } from "@/utils/gmail/scopes";
import {
  fetchGoogleOpenIdProfile,
  getGoogleOauthDiscoveryUrl,
  getGoogleOauthIssuer,
  isGoogleOauthEmulationEnabled,
} from "@/utils/google/oauth";
import { createScopedLogger } from "@/utils/logger";
import {
  getMicrosoftOauthDiscoveryUrl,
  getMicrosoftOauthIssuer,
  isMicrosoftEmulationEnabled,
} from "@/utils/microsoft/oauth";
import { createOutlookClient } from "@/utils/outlook/client";
import { SCOPES as OUTLOOK_SCOPES } from "@/utils/outlook/scopes";
import {
  claimPendingPremiumInvite,
  updateAccountSeats,
} from "@/utils/premium/seats";
import { safeExpo } from "@/utils/mobile-auth/expo";
import { clearAccountDisconnectedErrorIfResolved } from "@/utils/error-messages";
import { getEnabledLoginProviders } from "@/utils/oauth/login-providers";
import { getAppleClientSecret } from "@/utils/auth/apple-client-secret";
import { assertCanGenerateScimToken } from "@/utils/auth/scim";
import prisma from "@/utils/prisma";
import {
  getAuthProviderFromContext,
  isNewUserAuthContext,
  markAuthContextAsNewUser,
  trackAuthenticationCompleted,
} from "@/utils/analytics/auth-funnel.server";

import {
  emailOtpPlugin,
  emailOtpBeforeHook,
  emailOtpAfterHook,
  emailOtpSessionCreationHook,
} from "@/utils/auth/email-otp";

const logger = createScopedLogger("auth");
const renamedAuthUsers = new WeakMap<
  object,
  { userId: string; email: string }
>();
const EMAIL_ALREADY_LINKED_ERROR = "email_already_linked";
const useGoogleOauthEmulator = isGoogleOauthEmulationEnabled();
const useMicrosoftOauthEmulator = isMicrosoftEmulationEnabled();

// Register only configured OAuth providers so clients can't start disabled
// providers by posting directly to `/api/auth/sign-in/social`.
const enabledLoginProviders = getEnabledLoginProviders();
const googleLoginEnabled = enabledLoginProviders.has("google");
const microsoftLoginEnabled = enabledLoginProviders.has("microsoft");
const appleLoginEnabled = enabledLoginProviders.has("apple");

type AppleProfile = {
  email?: string;
  sub: string;
};

const mobileAuthOrigins = env.MOBILE_AUTH_ORIGIN
  ? [env.MOBILE_AUTH_ORIGIN]
  : [];
const desktopAuthOrigins = env.DESKTOP_AUTH_ORIGIN
  ? [env.DESKTOP_AUTH_ORIGIN]
  : [];
const googleSocialProvider =
  googleLoginEnabled && !useGoogleOauthEmulator
    ? {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        scope: [...GMAIL_SCOPES],
        accessType: "offline" as const,
        prompt: "select_account consent" as const,
        disableIdTokenSignIn: true,
        // For preview deployments, redirect through staging (which proxies back to preview URL)
        ...(env.OAUTH_PROXY_URL && {
          redirectURI: `${env.OAUTH_PROXY_URL}/api/auth/callback/google`,
        }),
      }
    : null;
const microsoftSocialProvider =
  microsoftLoginEnabled && !useMicrosoftOauthEmulator
    ? {
        clientId: env.MICROSOFT_CLIENT_ID!,
        clientSecret: env.MICROSOFT_CLIENT_SECRET!,
        scope: [...OUTLOOK_SCOPES],
        tenantId: env.MICROSOFT_TENANT_ID,
        disableIdTokenSignIn: true,
        ...(env.OAUTH_PROXY_URL && {
          redirectURI: `${env.OAUTH_PROXY_URL}/api/auth/callback/microsoft`,
        }),
      }
    : null;
const appleSocialProvider = appleLoginEnabled
  ? {
      clientId: env.APPLE_CLIENT_ID!,
      get clientSecret() {
        const clientSecret = getAppleClientSecret();
        if (!clientSecret) throw new Error("Apple OAuth is not configured");
        return clientSecret;
      },
      appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
      mapProfileToUser: async (profile: AppleProfile) => {
        if (profile.email) return {};

        const existingAppleAccount = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: "apple",
              providerAccountId: profile.sub,
            },
          },
          select: {
            user: {
              select: {
                email: true,
              },
            },
          },
        });

        return existingAppleAccount?.user.email
          ? { email: existingAppleAccount.user.email }
          : {};
      },
      ...(env.OAUTH_PROXY_URL && {
        redirectURI: `${env.OAUTH_PROXY_URL}/api/auth/callback/apple`,
      }),
    }
  : null;
const genericOauthConfig: GenericOAuthConfig[] = [
  ...(googleLoginEnabled && useGoogleOauthEmulator
    ? [
        {
          providerId: "google",
          discoveryUrl: getGoogleOauthDiscoveryUrl(),
          issuer: getGoogleOauthIssuer(),
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          scopes: [...GMAIL_SCOPES],
          pkce: true,
          accessType: "offline" as const,
          prompt: "select_account consent" as const,
          ...(env.OAUTH_PROXY_URL && {
            redirectURI: `${env.OAUTH_PROXY_URL}/api/auth/oauth2/callback/google`,
          }),
        },
      ]
    : []),
  ...(microsoftLoginEnabled && useMicrosoftOauthEmulator
    ? [
        {
          providerId: "microsoft",
          discoveryUrl: getMicrosoftOauthDiscoveryUrl(),
          issuer: getMicrosoftOauthIssuer(),
          clientId: env.MICROSOFT_CLIENT_ID!,
          clientSecret: env.MICROSOFT_CLIENT_SECRET!,
          scopes: [...OUTLOOK_SCOPES],
          pkce: true,
          prompt: "consent" as const,
          ...(env.OAUTH_PROXY_URL && {
            redirectURI: `${env.OAUTH_PROXY_URL}/api/auth/oauth2/callback/microsoft`,
          }),
        },
      ]
    : []),
];
const genericOauthPlugin =
  genericOauthConfig.length > 0
    ? genericOAuth({
        config: genericOauthConfig,
      })
    : null;

const socialProviders = {
  ...(googleSocialProvider ? { google: googleSocialProvider } : {}),
  ...(microsoftSocialProvider ? { microsoft: microsoftSocialProvider } : {}),
  ...(appleSocialProvider ? { apple: appleSocialProvider } : {}),
};

export const betterAuthConfig = betterAuth({
  advanced: {
    database: {
      generateId: false,
    },
  },
  logger: {
    level: "info",
    log: (level, message, ...args) => {
      switch (level) {
        case "info":
          logger.info(message, { args });
          break;
        case "error":
          logger.error(message, { args });
          break;
      }
    },
  },
  baseURL: env.NEXT_PUBLIC_BASE_URL,
  trustedOrigins: [
    env.NEXT_PUBLIC_BASE_URL,
    "https://appleid.apple.com",
    ...(env.OAUTH_PROXY_URL ? [env.OAUTH_PROXY_URL] : []),
    ...(env.ADDITIONAL_TRUSTED_ORIGINS ?? []),
    ...mobileAuthOrigins,
    ...desktopAuthOrigins,
  ],
  secret: env.AUTH_SECRET || env.NEXTAUTH_SECRET,
  emailAndPassword: {
    enabled: false,
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  plugins: [
    emailOtpPlugin,
    sso({
      disableImplicitSignUp: false,
      organizationProvisioning: { disabled: true },
    }),
    scim({
      providerOwnership: { enabled: true },
      storeSCIMToken: "hashed",
      beforeSCIMTokenGenerated: async ({ user, scimToken }) => {
        await assertCanGenerateScimToken({
          userEmail: user.email,
          scimToken,
        });
      },
    }),
    ...(genericOauthPlugin ? [genericOauthPlugin] : []),
    ...(mobileAuthOrigins.length > 0 ? [safeExpo()] : []),
    // OAuth proxy for preview deployments (Google doesn't allow wildcard redirect URIs)
    ...(env.OAUTH_PROXY_URL || env.IS_OAUTH_PROXY_SERVER
      ? [
          oAuthProxy({
            productionURL: env.OAUTH_PROXY_URL || env.NEXT_PUBLIC_BASE_URL,
          }),
        ]
      : []),
    nextCookies(), // Must be last
  ],
  session: {
    additionalFields: {
      emailOtp: { type: "boolean", defaultValue: false, input: false },
      emailOtpVersion: { type: "number", defaultValue: 0, input: false },
    },
    modelName: "Session",
    fields: {
      token: "sessionToken",
      expiresAt: "expires",
    },
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes — normal sign-out clears the cache cookie immediately;
      // this TTL only limits exposure for stolen-token scenarios
    },
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24 * 3, // 1 day (every 1 day the session expiration is updated)
  },
  account: {
    modelName: "Account",
    fields: {
      accountId: "providerAccountId",
      providerId: "provider",
      refreshToken: "refresh_token",
      refreshTokenExpiresAt: "refreshTokenExpiresAt",
      accessToken: "access_token",
      accessTokenExpiresAt: "expires_at",
      idToken: "id_token",
    },
    storeStateStrategy: "cookie", // Required for oAuthProxy to encrypt state
    accountLinking: {
      enabled: true,
      // Microsoft Entra email claims can be mutable/unverified, so Microsoft
      // must not implicitly link users by email during social sign-in.
      trustedProviders: ["google", "apple"],
    },
  },
  verification: {
    modelName: "VerificationToken",
    fields: {
      value: "token",
      expiresAt: "expires",
    },
  },
  socialProviders,
  databaseHooks: {
    session: {
      create: {
        before: emailOtpSessionCreationHook,
      },
    },
    user: {
      create: {
        before: async (user) => {
          if (isAllowedAuthSignupEmail(user.email)) return;

          logger.warn("Blocked auth sign-up outside configured allowlist", {
            emailDomain: user.email.split("@")[1]?.toLowerCase(),
          });
          assertAllowedAuthSignupEmail(user.email);
        },
        after: async (user, context) => {
          markAuthContextAsNewUser(context?.context);
          await postSignUp({
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          }).catch((error) => {
            logger.error("Error posting sign up", { error, user });
            captureException(error, { extra: { user } });
          });
        },
      },
    },
    account: {
      create: {
        after: async (account: Account) => {
          await handleLinkAccount(account);
        },
      },
      update: {
        after: async (account: Account, context) => {
          const isGoogleCallback =
            !!(
              context?.path?.startsWith("/callback/") ||
              context?.path?.startsWith("/oauth2/callback/")
            ) && getAuthProviderFromContext(context) === "google";
          const renamedUser = await handleLinkAccount(
            account,
            isGoogleCallback,
          );
          if (renamedUser && context?.context)
            renamedAuthUsers.set(context.context, renamedUser);
        },
      },
    },
  },
  hooks: {
    before: emailOtpBeforeHook,
    after: createAuthMiddleware(async (context) => {
      const renamedUser = renamedAuthUsers.get(context.context);
      const newSession = context.context.newSession;
      if (renamedUser && newSession?.user.id === renamedUser.userId) {
        newSession.user.email = renamedUser.email;
        newSession.user.emailVerified = true;
        await setSessionCookie(context, newSession);
      }
      await emailOtpAfterHook(context);
      try {
        const authenticatedSession = context.context.newSession;
        if (!authenticatedSession) return;

        const provider = getAuthProviderFromContext(context);
        if (provider === "unknown") return;

        const email = authenticatedSession.user.email;
        const isNewUser = isNewUserAuthContext(context.context);

        after(() =>
          trackAuthenticationCompleted({ email, provider, isNewUser }),
        );
      } catch (error) {
        logger.error("Failed to schedule authentication analytics", { error });
      }
    }),
  },
  onAPIError: {
    throw: true,
    onError: (error: unknown) => {
      logger.error("Auth API encountered an error", { error });
    },
    errorURL: "/login/error",
  },
});

async function postSignUp({
  id: userId,
  email,
  name,
  image,
}: {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}) {
  const loops = async () => {
    const account = await prisma.account
      .findFirst({
        where: { userId },
        select: { provider: true },
      })
      .catch((error) => {
        logger.error("Error finding account", {
          userId,
          error,
        });
        captureException(error, { userEmail: email });
      });

    await createLoopsContact(
      email,
      name?.split(" ")?.[0],
      account?.provider,
    ).catch((error) => {
      const alreadyExists =
        error instanceof Error && error.message.includes("409");
      if (!alreadyExists) {
        logger.error("Error creating Loops contact", {
          email,
          error,
        });
        captureException(error, { userEmail: email });
      }
    });
  };

  const resend = createResendContact({ email }).catch((error) => {
    logger.error("Error creating Resend contact", {
      email,
      error,
    });
    captureException(error, { userEmail: email });
  });

  const dub = trackDubSignUp({ id: userId, email, name, image }, logger).catch(
    (error) => {
      logger.error("Error tracking Dub sign up", {
        email,
        error,
      });
      captureException(error, { userEmail: email });
    },
  );

  await Promise.all([
    loops(),
    resend,
    dub,
    handlePendingPremiumInvite({ email }),
    handleReferralOnSignUp({ userId, email }),
  ]);
}

async function handlePendingPremiumInvite({ email }: { email: string }) {
  try {
    logger.info("Handling pending premium invite", { email });

    // Check for pending invite
    const premium = await prisma.premium.findFirst({
      where: { pendingInvites: { has: email } },
      select: {
        id: true,
        lemonSqueezySubscriptionItemId: true,
        stripeSubscriptionId: true,
      },
    });

    if (
      premium?.lemonSqueezySubscriptionItemId ||
      premium?.stripeSubscriptionId
    ) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (user) {
        await claimPendingPremiumInvite({
          visitorId: user.id,
          premiumId: premium.id,
          email,
        });
        logger.info("Added user to premium from invite", { email });
      }
    }
  } catch (error) {
    logger.error("Error handling pending premium invite", { error, email });
    captureException(error, {
      extra: { email, location: "handlePendingPremiumInvite" },
    });
  }
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

    let referralCode = referralCookie.value;
    try {
      referralCode = decodeURIComponent(referralCode);
    } catch {
      // Use original value if decoding fails
    }
    logger.info("Processing referral for new user", {
      email,
      referralCode,
    });

    // Import the createReferral function
    const { createReferral } = await import("@/utils/referral/referral-code");
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

// TODO: move into email provider instead of checking the provider type
async function getProfileData(providerId: string, accessToken: string) {
  if (isGoogleProvider(providerId)) {
    const profile = await fetchGoogleOpenIdProfile(accessToken);
    return {
      email: profile.email.toLowerCase(),
      name: profile.name,
      image: profile.picture ?? null,
      sub: profile.sub,
      emailVerified: profile.email_verified,
      hostedDomain: profile.hd,
    };
  }

  if (isMicrosoftProvider(providerId)) {
    const client = createOutlookClient(accessToken, logger);
    try {
      const profileResponse = await client.getUserProfile();

      // Get photo separately as it requires a different endpoint
      let photoUrl = null;
      try {
        const photo = await client.getUserPhoto();
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
  }
}

function shouldLinkEmailAccount(providerId: string) {
  return isGoogleProvider(providerId) || isMicrosoftProvider(providerId);
}

export async function handleLinkAccount(
  account: Account,
  allowEmailRename = false,
) {
  let primaryEmail: string | null | undefined;
  let primaryName: string | null | undefined;
  let primaryPhotoUrl: string | null | undefined;

  try {
    if (!shouldLinkEmailAccount(account.providerId)) {
      logger.info("[linkAccount] Skipping email account linking", {
        userId: account.userId,
        accountId: account.id,
      });
      return;
    }

    if (!account.accessToken) {
      logger.error(
        "[linkAccount] No access_token found in data, cannot fetch profile.",
      );
      throw new Error("Missing access token during account linking.");
    }
    const profileData = await getProfileData(
      account.providerId,
      account.accessToken,
    );

    if (!profileData?.email) {
      logger.error("[handleLinkAccount] No email found in profile data");
    }

    primaryEmail = profileData?.email;
    primaryName = profileData?.name;
    primaryPhotoUrl = profileData?.image;

    if (!primaryEmail) {
      logger.error(
        "[linkAccount] Primary email could not be determined from profile.",
      );
      throw new Error("Primary email not found for linked account.");
    }

    const normalizedEmail = primaryEmail.trim().toLowerCase();

    // Profile emails can change while the provider account remains the same.
    const linkedEmailAccount = await prisma.emailAccount.findUnique({
      where: { accountId: account.id },
      select: {
        id: true,
        email: true,
        userId: true,
        accountId: true,
        account: { select: { provider: true } },
      },
    });
    const existingEmailAccount =
      linkedEmailAccount ??
      (await prisma.emailAccount.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          userId: true,
          accountId: true,
          account: { select: { provider: true } },
        },
      }));

    if (
      existingEmailAccount &&
      existingEmailAccount.userId !== account.userId
    ) {
      logger.error("[linkAccount] Email already linked to a different user", {
        email: primaryEmail,
        existingUserId: existingEmailAccount.userId,
        newUserId: account.userId,
      });
      throw APIError.from("BAD_REQUEST", {
        message: EMAIL_ALREADY_LINKED_ERROR,
        code: EMAIL_ALREADY_LINKED_ERROR,
      });
    }

    const crossProviderRelink =
      existingEmailAccount &&
      existingEmailAccount.userId === account.userId &&
      existingEmailAccount.accountId !== account.id &&
      existingEmailAccount.account.provider !== account.providerId;

    if (crossProviderRelink) {
      logger.warn(
        "[linkAccount] Skipping cross-provider EmailAccount reassignment",
        {
          userId: account.userId,
          accountId: account.id,
          currentProvider: existingEmailAccount.account.provider,
          attemptedProvider: account.providerId,
        },
      );

      await prisma.$transaction([
        prisma.emailAccount.update({
          where: { id: existingEmailAccount.id },
          data: {
            name: primaryName,
            image: primaryPhotoUrl,
          },
        }),
        prisma.account.update({
          where: { id: account.id },
          data: { disconnectedAt: null },
        }),
      ]);

      await clearAccountDisconnectedErrorIfResolved({
        userId: account.userId,
        logger,
      });

      scheduleEmailWatchesAfterLink(account.userId);
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: account.userId },
      select: { email: true, name: true, image: true },
    });

    if (!user?.email) {
      logger.error("[linkAccount] No user email found", {
        userId: account.userId,
      });
      return;
    }

    const renamedMailbox =
      allowEmailRename && linkedEmailAccount && profileData
        ? await renameGoogleEmail({
            account,
            mailbox: linkedEmailAccount,
            userEmail: user.email,
            profile: { ...profileData, email: normalizedEmail },
          })
        : undefined;

    const data = {
      userId: account.userId,
      accountId: account.id,
      name: primaryName,
      image: primaryPhotoUrl,
    };

    const upsertedEmailAccount =
      renamedMailbox ??
      (
        await prisma.$transaction([
          linkedEmailAccount
            ? prisma.emailAccount.update({
                where: {
                  id: linkedEmailAccount.id,
                  userId: account.userId,
                  accountId: account.id,
                  account: {
                    userId: account.userId,
                    provider: account.providerId,
                    providerAccountId: account.accountId,
                  },
                },
                data: { name: primaryName, image: primaryPhotoUrl },
                select: { id: true },
              })
            : prisma.emailAccount.upsert({
                where: { email: normalizedEmail },
                update: data,
                create: {
                  ...data,
                  email: normalizedEmail,
                  mailSplits: {
                    create: INITIAL_MAIL_SPLITS.map((split, order) => ({
                      ...split,
                      order,
                    })),
                  },
                },
                select: { id: true },
              }),
          prisma.account.update({
            where: {
              id: account.id,
              userId: account.userId,
              providerAccountId: account.accountId,
            },
            data: { disconnectedAt: null },
          }),
        ])
      )[0];

    await clearAccountDisconnectedErrorIfResolved({
      userId: account.userId,
      logger,
    });

    if (env.AUTO_JOIN_ORGANIZATION_ENABLED) {
      await autoJoinOrganization(upsertedEmailAccount.id).catch((error) => {
        logger.error("[linkAccount] Error auto-joining organization", {
          error,
        });
        captureException(error, { extra: { userId: account.userId } });
      });
    }

    // Handle premium account seats
    await updateAccountSeats({ userId: account.userId }).catch((error) => {
      logger.error("[linkAccount] Error updating premium account seats:", {
        userId: account.userId,
        error,
      });
      captureException(error, { extra: { userId: account.userId } });
    });

    scheduleEmailWatchesAfterLink(account.userId);

    logger.info("[linkAccount] Successfully linked account", {
      email: user.email,
      userId: account.userId,
      accountId: account.id,
    });
    return renamedMailbox?.renamedUser;
  } catch (error) {
    logger.error("[linkAccount] Error during linking process:", {
      userId: account.userId,
      error,
    });
    captureException(error, {
      extra: { userId: account.userId, location: "linkAccount" },
    });
    throw error;
  }
}

export const auth = async (
  requestHeaders?: Headers | Awaited<ReturnType<typeof headers>>,
) => {
  try {
    return await betterAuthConfig.api.getSession({
      headers: requestHeaders ?? (await headers()),
    });
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 401) return null;
    throw error;
  }
};

async function autoJoinOrganization(emailAccountId: string) {
  const orgs = await prisma.organization.findMany({
    select: { id: true },
    take: 2,
  });

  if (orgs.length !== 1) {
    if (orgs.length === 0) {
      logger.warn("[autoJoinOrganization] No organization found to auto-join");
    } else {
      logger.warn(
        "[autoJoinOrganization] Multiple organizations found, skipping auto-join",
      );
    }
    return;
  }

  const organizationId = orgs[0].id;

  const member = await prisma.member.upsert({
    where: { emailAccountId },
    update: {},
    create: {
      organizationId,
      emailAccountId,
      role: "member",
      allowOrgAdminAnalytics: env.AUTO_ENABLE_ORG_ANALYTICS,
    },
    select: { id: true, createdAt: true },
  });

  logger.info("[autoJoinOrganization] Auto-joined user to organization", {
    emailAccountId,
    organizationId,
    memberId: member.id,
  });
}

function scheduleEmailWatchesAfterLink(userId: string) {
  after(() =>
    ensureEmailAccountsWatched({
      userIds: [userId],
      logger,
    }).catch((error) => {
      logger.error("[linkAccount] Error re-registering email watches", {
        userId,
        error,
      });
      captureException(error, {
        extra: { userId, location: "linkAccountWatch" },
      });
    }),
  );
}
