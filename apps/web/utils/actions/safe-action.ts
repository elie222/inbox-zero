import { createSafeActionClient } from "next-safe-action";
import { withServerActionInstrumentation } from "@sentry/nextjs";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createScopedLogger } from "@/utils/logger";

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
  .use(async ({ next, metadata }) => {
    const session = await auth();

    if (!session?.user) throw new Error("Unauthorized");
    const userEmail = session.user.email;
    if (!userEmail) throw new Error("Unauthorized");

    return withServerActionInstrumentation(metadata?.name, async () => {
      return next({
        ctx: {
          userId: session.user.id,
          userEmail,
          session,
        },
      });
    });
  });
