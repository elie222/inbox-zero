import {
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action";
import { withServerActionInstrumentation } from "@sentry/nextjs";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { isAdmin } from "@/utils/admin";
import { SafeError } from "@/utils/error";

// TODO: take functionality from `withActionInstrumentation` and move it here (apps/web/utils/actions/middleware.ts)

const logger = createScopedLogger("safe-action");

const baseClient = createSafeActionClient({
  defineMetadataSchema() {
    return z.object({ name: z.string() });
  },
  handleServerError(e) {
    if (e instanceof SafeError) return e.message;

    return DEFAULT_SERVER_ERROR_MESSAGE;
  },
}).use(async ({ next, metadata }) => {
  logger.info("Calling action", { name: metadata?.name });
  return next();
});

export const actionClient = baseClient
  .bindArgsSchemas<[activeEmail: z.ZodString]>([z.string()])
  .use(async ({ next, metadata, bindArgsClientInputs }) => {
    const session = await auth();

    if (!session?.user) throw new Error("Unauthorized");
    const userEmail = session.user.email;
    if (!userEmail) throw new Error("Unauthorized");

    const userId = session.user.id;
    const email = bindArgsClientInputs[0] as string;

    // validate user owns this email
    const emailAccount = email
      ? await prisma.emailAccount.findUnique({
          where: { email },
        })
      : null;
    if (email && emailAccount?.userId !== userId)
      throw new Error("Unauthorized");

    return withServerActionInstrumentation(metadata?.name, async () => {
      return next({
        ctx: {
          userId,
          userEmail,
          // session,
          email,
          emailAccount,
        },
      });
    });
  });

// doesn't bind to a specific email
export const actionClientUser = baseClient.use(async ({ next, metadata }) => {
  const session = await auth();

  if (!session?.user) throw new Error("Unauthorized");
  const userEmail = session.user.email;
  if (!userEmail) throw new Error("Unauthorized");

  const userId = session.user.id;

  return withServerActionInstrumentation(metadata?.name, async () => {
    return next({
      ctx: { userId },
    });
  });
});

export const adminActionClient = baseClient.use(async ({ next, metadata }) => {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!isAdmin({ email: session.user.email })) throw new Error("Unauthorized");

  return withServerActionInstrumentation(metadata?.name, async () => {
    return next({ ctx: {} });
  });
});
