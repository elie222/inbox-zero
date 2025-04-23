import { createSafeActionClient } from "next-safe-action";
import { withServerActionInstrumentation } from "@sentry/nextjs";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { isAdmin } from "@/utils/admin";

// TODO: take functionality from `withActionInstrumentation` and move it here (apps/web/utils/actions/middleware.ts)

const logger = createScopedLogger("safe-action");

export const actionClient = createSafeActionClient({
  defineMetadataSchema() {
    return z.object({ name: z.string() });
  },
})
  .use(async ({ next, metadata }) => {
    logger.info("Calling action", { name: metadata?.name });
    return next();
  })
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
          session,
          email,
          emailAccount,
        },
      });
    });
  });

export const adminActionClient = createSafeActionClient({
  defineMetadataSchema() {
    return z.object({ name: z.string() });
  },
})
  .use(async ({ next, metadata }) => {
    logger.info("Calling action", { name: metadata?.name });
    return next();
  })
  .use(async ({ next, metadata }) => {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");
    if (!isAdmin({ email: session.user.email }))
      throw new Error("Unauthorized");

    return withServerActionInstrumentation(metadata?.name, async () => {
      return next({ ctx: {} });
    });
  });
