// Temporary auth config for Better Auth CLI with relative imports
import { sso } from "@better-auth/sso";
import { createContact as createLoopsContact } from "@inboxzero/loops";
import { createContact as createResendContact } from "@inboxzero/resend";
import type { Prisma } from "@prisma/client";
import type { Account, AuthContext, User } from "better-auth";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { cookies, headers } from "next/headers";
import { env } from "./env";
import { trackDubSignUp } from "./utils/dub";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "./utils/email/provider-types";
import { encryptToken } from "./utils/encryption";
import { captureException } from "./utils/error";
import { createScopedLogger } from "./utils/logger";
import prisma from "./utils/prisma";
import { isAdmin } from "./utils/admin";

const logger = createScopedLogger("auth");

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    microsoft: {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
    },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 1,
    }),
    sso({
      providers: {
        saml: {
          name: "SAML",
          issuer: "inboxzero",
          singleSignOnUrl: "https://example.com/sso",
          x509: "-----BEGIN CERTIFICATE-----\nMOCK_CERT\n-----END CERTIFICATE-----",
        },
      },
    }),
  ],
  trustedOrigins: [env.NEXT_PUBLIC_BASE_URL],
  baseURL: env.NEXT_PUBLIC_BASE_URL,
  secret: env.BETTER_AUTH_SECRET,
  logger: {
    level: "error",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.email) {
        return false;
      }

      if (isGoogleProvider(account?.provider)) {
        await createGoogleContact(user.email, user.name || "");
      }

      if (isMicrosoftProvider(account?.provider)) {
        await createMicrosoftContact(user.email, user.name || "");
      }

      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.email = user.email;
        session.user.name = user.name;
        session.user.image = user.image;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      if (!user.email) {
        return;
      }

      if (isGoogleProvider(account?.provider)) {
        await createGoogleContact(user.email, user.name || "");
      }

      if (isMicrosoftProvider(account?.provider)) {
        await createMicrosoftContact(user.email, user.name || "");
      }
    },
  },
});

// Helper functions
async function createGoogleContact(email: string, name: string) {
  try {
    await createLoopsContact({
      email,
      firstName: name.split(" ")[0] || "",
      lastName: name.split(" ").slice(1).join(" ") || "",
      source: "google",
    });
  } catch (error) {
    logger.error("Failed to create Google contact", { error, email });
  }
}

async function createMicrosoftContact(email: string, name: string) {
  try {
    await createResendContact({
      email,
      firstName: name.split(" ")[0] || "",
      lastName: name.split(" ").slice(1).join(" ") || "",
      source: "microsoft",
    });
  } catch (error) {
    logger.error("Failed to create Microsoft contact", { error, email });
  }
}

export default auth;
