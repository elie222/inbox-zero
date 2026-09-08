import { createHash } from "node:crypto";
import { APIError } from "better-auth";
import { deleteSessionCookie } from "better-auth/cookies";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { after } from "next/server";
import { deliverTransactionalEmail } from "@inboxzero/transactional-email/src/delivery";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("auth/email-otp");

export const emailOtpPlugin = emailOTP({
  disableSignUp: true,
  // VerificationToken.token is globally unique; randomized encryption avoids
  // collisions when two accounts receive the same short code.
  storeOTP: "encrypted",
  expiresIn: 300,
  allowedAttempts: 5,
  rateLimit: { window: 60, max: 5 },
  async sendVerificationOTP({ email, otp, type }) {
    if (type !== "sign-in") return;
    after(async () => {
      try {
        if (!(await isEmailOtpEnabled(email))) return;
        const result = await deliverTransactionalEmail({
          from: env.RESEND_FROM_EMAIL,
          to: email,
          subject: "Your Inbox Zero sign-in code",
          html: `<p>Your Inbox Zero sign-in code is <strong>${otp}</strong>.</p><p>It expires in 5 minutes and gives access to your entire Inbox Zero account, including all connected mailboxes and calendars.</p><p>If you did not request this code, you can ignore this email.</p>`,
          text: `Your Inbox Zero sign-in code is ${otp}.\n\nThis code expires in 5 minutes and can be used once. It gives access to your entire Inbox Zero account, including all connected mailboxes and calendars.\n\nIf you did not request this code, you can ignore this email.`,
        });
        if (!result) {
          logger.error("Failed to deliver sign-in code");
        }
      } catch {
        // Provider errors can include the message body and its sign-in code.
        logger.error("Failed to deliver sign-in code");
      }
    });
  },
});

export const emailOtpBeforeHook = createAuthMiddleware(async (ctx) => {
  if (ctx.path === "/email-otp/send-verification-otp") {
    if (ctx.body?.type !== "sign-in") throw invalidCode();
    const email = normalizeEmail(ctx.body?.email);
    if (!(await isEmailOtpEnabled(email)) || !(await claimDelivery(email))) {
      return ctx.json({ success: true });
    }
    return;
  }
  if (ctx.path === "/sign-in/email-otp") {
    if (!(await isEmailOtpEnabled(normalizeEmail(ctx.body?.email)))) {
      throw invalidCode();
    }
    return;
  }
  // The plugin also exposes password reset and email-change endpoints. This
  // feature only authorizes sign-in to an existing, explicitly enabled account.
  if (
    ctx.path?.startsWith("/email-otp/") ||
    ctx.path === "/forget-password/email-otp"
  ) {
    throw invalidCode();
  }

  if (ctx.path === "/sign-out" || ctx.path === "/get-session") return;

  const current = await getSessionFromCtx(ctx);
  const session = current?.session as EmailOtpSession | undefined;
  if (!session?.emailOtp) return;
  await assertEmailOtpSession(session);
  throw new APIError("FORBIDDEN", {
    message: "Sign in with your connected provider to manage authentication.",
  });
});

export const emailOtpAfterHook = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/get-session") return;
  const session = ctx.context.session?.session as EmailOtpSession | undefined;
  if (!session?.emailOtp) return;
  try {
    await assertEmailOtpSession(session);
  } catch (error) {
    if (!(error instanceof APIError) || error.statusCode !== 401) throw error;
    deleteSessionCookie(ctx);
    ctx.context.session = null;
    throw error;
  }
});

type EmailOtpSession = { id: string; userId: string; emailOtp?: boolean };

export async function emailOtpSessionCreationHook<T extends { userId: string }>(
  session: T,
  context?: { path?: string } | null,
) {
  if (context?.path !== "/sign-in/email-otp") return;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { emailOtpEnabled: true },
  });
  if (!user?.emailOtpEnabled) throw invalidCode();
  return { data: { ...session, emailOtp: true } };
}

async function isEmailOtpEnabled(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { emailOtpEnabled: true },
  });
  return user?.emailOtpEnabled === true;
}

async function assertEmailOtpSession(session: { id: string; userId: string }) {
  const active = await prisma.session.findFirst({
    where: {
      id: session.id,
      userId: session.userId,
      emailOtp: true,
      expires: { gt: new Date() },
      user: { emailOtpEnabled: true },
    },
    select: { id: true },
  });
  if (!active)
    throw new APIError("UNAUTHORIZED", {
      message: "Session expired. Please sign in again.",
    });
}

async function claimDelivery(email: string) {
  const token = `email-otp-cooldown:${createHash("sha256").update(email).digest("hex")}`;
  await prisma.verificationToken.deleteMany({
    where: { token, expires: { lte: new Date() } },
  });
  try {
    await prisma.verificationToken.create({
      data: {
        token,
        identifier: "email-otp-cooldown",
        expires: new Date(Date.now() + 60_000),
      },
    });
    return true;
  } catch (error) {
    if (isDuplicateError(error)) return false;
    throw error;
  }
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function invalidCode() {
  return new APIError("BAD_REQUEST", {
    message: "Invalid or expired sign-in code.",
  });
}
