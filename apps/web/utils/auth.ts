import { sso } from "@better-auth/sso";
import { expo } from "@better-auth/expo";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { oAuthProxy } from "better-auth/plugins";
import { createContact as createLoopsContact } from "@inboxzero/loops";
import { createContact as createResendContact } from "@inboxzero/resend";
import type { Account, AuthContext } from "better-auth";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { cookies, headers } from "next/headers";
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
import { captureException } from "@/utils/error";
import { getContactsClient as getGoogleContactsClient } from "@/utils/gmail/client";
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
import { clearSpecificErrorMessages, ErrorType } from "@/utils/error-messages";
import { hasMicrosoftOauthConfig } from "@/utils/oauth/provider-config";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("auth");
const useGoogleOauthEmulator = isGoogleOauthEmulationEnabled();
const useMicrosoftOauthEmulator = isMicrosoftEmulationEnabled();
const hasMicrosoftConfig = hasMicrosoftOauthConfig();

const mobileAuthOrigins = env.MOBILE_AUTH_ORIGIN
  ? [env.MOBILE_AUTH_ORIGIN]
  : [];
const googleSocialProvider = !useGoogleOauthEmulator
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
  hasMicrosoftConfig && !useMicrosoftOauthEmulator
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
const genericOauthConfig: GenericOAuthConfig[] = [
  ...(useGoogleOauthEmulator
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
  ...(hasMicrosoftConfig && useMicrosoftOauthEmulator
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
    ...(env.OAUTH_PROXY_URL ? [env.OAUTH_PROXY_URL] : []),
    ...(env.ADDITIONAL_TRUSTED_ORIGINS ?? []),
    ...mobileAuthOrigins,
  ],
  secret: env.AUTH_SECRET || env.NEXTAUTH_SECRET,
  emailAndPassword: {
    enabled: false,
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  plugins: [
    sso({
      disableImplicitSignUp: false,
      organizationProvisioning: { disabled: true },
    }),
    ...(genericOauthPlugin ? [genericOauthPlugin] : []),
    ...(mobileAuthOrigins.length > 0 ? [expo()] : []),
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
      trustedProviders: ["google", "microsoft"],
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
    user: {
      create: {
        before: async (user) => {
          if (isAllowedAuthSignupEmail(user.email)) return;

          logger.warn("Blocked auth sign-up outside configured allowlist", {
            emailDomain: user.email.split("@")[1]?.toLowerCase(),
          });
          assertAllowedAuthSignupEmail(user.email);
        },
        after: async (user) => {
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
        after: async (account: Account) => {
          await handleLinkAccount(account);
        },
      },
    },
  },
  onAPIError: {
    throw: true,
    onError: (error: unknown, ctx: AuthContext) => {
      logger.error("Auth API encountered an error", { error, ctx });
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
    if (useGoogleOauthEmulator) {
      const profile = await fetchGoogleOpenIdProfile(accessToken);

      return {
        email: profile.email?.toLowerCase(),
        name: profile.name,
        image: profile.picture ?? null,
      };
    }

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
      image: profileResponse.data.photos?.find((p) => p.metadata?.primary)?.url,
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

export async function handleLinkAccount(account: Account) {
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

    // Check if email already belongs to a different user
    const existingEmailAccount = await prisma.emailAccount.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        userId: true,
        accountId: true,
        account: { select: { provider: true } },
      },
    });

    if (
      existingEmailAccount &&
      existingEmailAccount.userId !== account.userId
    ) {
      logger.error("[linkAccount] Email already linked to a different user", {
        email: primaryEmail,
        existingUserId: existingEmailAccount.userId,
        newUserId: account.userId,
      });
      throw new Error("email_already_linked");
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

      await clearSpecificErrorMessages({
        userId: account.userId,
        errorTypes: [ErrorType.ACCOUNT_DISCONNECTED],
        logger,
      });

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

    const data = {
      userId: account.userId,
      accountId: account.id,
      name: primaryName,
      image: primaryPhotoUrl,
    };

    const [upsertedEmailAccount] = await prisma.$transaction([
      prisma.emailAccount.upsert({
        where: { email: normalizedEmail },
        update: data,
        create: {
          ...data,
          email: normalizedEmail,
        },
        select: { id: true },
      }),
      prisma.account.update({
        where: { id: account.id },
        data: { disconnectedAt: null },
      }),
    ]);

    await clearSpecificErrorMessages({
      userId: account.userId,
      errorTypes: [ErrorType.ACCOUNT_DISCONNECTED],
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

    logger.info("[linkAccount] Successfully linked account", {
      email: user.email,
      userId: account.userId,
      accountId: account.id,
    });
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
) =>
  betterAuthConfig.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });

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
