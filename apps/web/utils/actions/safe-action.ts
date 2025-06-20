import { createSafeActionClient } from "next-safe-action";
import { withServerActionInstrumentation } from "@sentry/nextjs";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { isAdmin } from "@/utils/admin";
import { SafeError } from "@/utils/error";
import { env } from "@/env";

// TODO: take functionality from `withActionInstrumentation` and move it here (apps/web/utils/actions/middleware.ts)

const logger = createScopedLogger("safe-action");

const baseClient = createSafeActionClient({
  defineMetadataSchema() {
    return z.object({ name: z.string() });
  },
  handleServerError(error, { metadata, ctx, bindArgsClientInputs }) {
    const context = ctx as any;
    logger.error("Server action error:", {
      metadata,
      userId: context?.userId,
      userEmail: context?.userEmail,
      emailAccountId: context?.emailAccountId,
      bindArgsClientInputs,
      error: error.message,
    });
    // Need a better way to handle this within logger itself
    if (env.NODE_ENV !== "production") console.log("Error:", error);
    if (error instanceof SafeError) return error.message;
    return "An unknown error occurred.";
  },
}).use(async ({ next, metadata }) => {
  logger.info("Calling action", { name: metadata?.name });
  return next();
});
// .schema(z.object({}), {
//   handleValidationErrorsShape: async (ve) =>
//     flattenValidationErrors(ve).fieldErrors,
// });

export const actionClient = baseClient
  .bindArgsSchemas<[emailAccountId: z.ZodString]>([z.string()])
  .use(async ({ next, metadata, bindArgsClientInputs }) => {
    const session = await auth();

    if (!session?.user) throw new SafeError("Unauthorized");
    const userEmail = session.user.email;
    if (!userEmail) throw new SafeError("Unauthorized");

    const userId = session.user.id;
    const emailAccountId = bindArgsClientInputs[0] as string;

    // validate user owns this email
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        email: true,
        account: {
          select: {
            userId: true,
            provider: true,
          },
        },
      },
    });
    if (!emailAccount || emailAccount?.account.userId !== userId)
      throw new SafeError("Unauthorized");

    return withServerActionInstrumentation(metadata?.name, async () => {
      return next({
        ctx: {
          userId,
          userEmail,
          session,
          emailAccountId,
          emailAccount,
          provider: emailAccount.account.provider,
        },
      });
    });
  });

// doesn't bind to a specific email
export const actionClientUser = baseClient.use(async ({ next, metadata }) => {
  const session = await auth();

  if (!session?.user) throw new SafeError("Unauthorized");

  const userId = session.user.id;

  return withServerActionInstrumentation(metadata?.name, async () => {
    return next({
      ctx: { userId },
    });
  });
});

export const adminActionClient = baseClient.use(async ({ next, metadata }) => {
  const session = await auth();
  if (!session?.user) throw new SafeError("Unauthorized");
  if (!isAdmin({ email: session.user.email }))
    throw new SafeError("Unauthorized");

  return withServerActionInstrumentation(metadata?.name, async () => {
    return next({ ctx: {} });
  });
});
