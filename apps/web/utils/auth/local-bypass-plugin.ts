import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import {
  LOCAL_BYPASS_ACCESS_TOKEN,
  LOCAL_BYPASS_PROVIDER,
  LOCAL_BYPASS_USER_EMAIL,
  LOCAL_BYPASS_USER_NAME,
  getLocalBypassProviderAccountId,
  isLocalAuthBypassEnabled,
} from "@/utils/auth/local-bypass-config";
import { WELCOME_PATH } from "@/utils/config";
import { isInternalPath } from "@/utils/path";
import prisma from "@/utils/prisma";

const localBypassSignInSchema = z.object({
  callbackURL: z.string().optional(),
});

type LocalBypassUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  image?: string | null;
};

type LocalBypassInternalAdapter = {
  findUserByEmail: (email: string) => Promise<{ user: LocalBypassUser } | null>;
  createUser: (user: {
    email: string;
    name: string;
    emailVerified: boolean;
  }) => Promise<LocalBypassUser | null>;
};

export function localBypassAuthPlugin() {
  return {
    id: "local-bypass-auth",
    endpoints: {
      signInLocalBypass: createAuthEndpoint(
        "/sign-in/local-bypass",
        {
          method: "POST",
          body: localBypassSignInSchema,
        },
        async (ctx) => {
          if (!isLocalAuthBypassEnabled()) {
            throw new APIError("NOT_FOUND", { message: "Not found" });
          }

          const user = await getOrCreateLocalBypassUser(
            ctx.context.internalAdapter,
          );
          await ensureLocalBypassAccount(user);

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Failed to create local bypass session",
            });
          }

          await setSessionCookie(
            ctx,
            {
              session,
              user,
            },
            false,
          );

          const callbackURL = isInternalPath(ctx.body.callbackURL)
            ? ctx.body.callbackURL
            : WELCOME_PATH;

          return ctx.json({ callbackURL });
        },
      ),
    },
  };
}

async function getOrCreateLocalBypassUser(
  internalAdapter: LocalBypassInternalAdapter,
) {
  const existingUser = await internalAdapter.findUserByEmail(
    LOCAL_BYPASS_USER_EMAIL,
  );
  if (existingUser?.user) {
    return existingUser.user;
  }

  const createdUser = await internalAdapter.createUser({
    email: LOCAL_BYPASS_USER_EMAIL,
    name: LOCAL_BYPASS_USER_NAME,
    emailVerified: true,
  });

  if (!createdUser) {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: "Failed to create local bypass user",
    });
  }

  return createdUser;
}

async function ensureLocalBypassAccount(user: LocalBypassUser) {
  const account = await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: LOCAL_BYPASS_PROVIDER,
        providerAccountId: getLocalBypassProviderAccountId(user.id),
      },
    },
    update: {
      userId: user.id,
      disconnectedAt: null,
      access_token: LOCAL_BYPASS_ACCESS_TOKEN,
      refresh_token: LOCAL_BYPASS_ACCESS_TOKEN,
      expires_at: getFutureDate(),
      refreshTokenExpiresAt: getFutureDate(),
    },
    create: {
      userId: user.id,
      provider: LOCAL_BYPASS_PROVIDER,
      providerAccountId: getLocalBypassProviderAccountId(user.id),
      access_token: LOCAL_BYPASS_ACCESS_TOKEN,
      refresh_token: LOCAL_BYPASS_ACCESS_TOKEN,
      expires_at: getFutureDate(),
      refreshTokenExpiresAt: getFutureDate(),
    },
    select: {
      id: true,
    },
  });

  await prisma.emailAccount.upsert({
    where: { email: LOCAL_BYPASS_USER_EMAIL },
    update: {
      userId: user.id,
      accountId: account.id,
      name: LOCAL_BYPASS_USER_NAME,
      image: user.image || null,
    },
    create: {
      email: LOCAL_BYPASS_USER_EMAIL,
      userId: user.id,
      accountId: account.id,
      name: LOCAL_BYPASS_USER_NAME,
      image: user.image || null,
    },
  });
}

function getFutureDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date;
}
