import { createSafeActionClient } from "next-safe-action";
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
  handleServerError(error) {
    logger.error("Server action error:", { error });
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
  .bindArgsSchemas<[activeEmail: z.ZodString]>([z.string()])
  .use(async ({ next, metadata, bindArgsClientInputs }) => {
    const session = await auth();

    if (!session?.user) throw new SafeError("Unauthorized");
    const userEmail = session.user.email;
    if (!userEmail) throw new SafeError("Unauthorized");

    const userId = session.user.id;
    const email = bindArgsClientInputs[0] as string;

    // validate user owns this email
    const emailAccount = email
      ? await prisma.emailAccount.findUnique({
          where: { email },
        })
      : null;
    if (email && emailAccount?.userId !== userId)
      throw new SafeError("Unauthorized");

    return withServerActionInstrumentation(metadata?.name, async () => {
      return next({
        ctx: {
          userId,
          userEmail,
          session,
          email,
          emailAccount,
        },
      });
    });
  });

// doesn't bind to a specific email
export const actionClientUser = baseClient.use(async ({ next, metadata }) => {
  const session = await auth();

  if (!session?.user) throw new SafeError("Unauthorized");
  const userEmail = session.user.email;
  if (!userEmail) throw new SafeError("Unauthorized");

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
