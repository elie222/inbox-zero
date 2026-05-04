import { createSafeActionClient } from "next-safe-action";
import * as Sentry from "@sentry/nextjs";
import { withServerActionInstrumentation } from "@sentry/nextjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { after } from "next/server";
import { auth } from "@/utils/auth";
import { createScopedLogger } from "@/utils/logger";
import { flushLoggerSafely } from "@/utils/logger-flush";
import prisma from "@/utils/prisma";
import { isAdmin } from "@/utils/admin";
import { captureException, SafeError } from "@/utils/error";
import { env } from "@/env";
import { runWithAuditContext, setAuditContext } from "@/utils/audit/context";

// TODO: take functionality from `withActionInstrumentation` and move it here (apps/web/utils/actions/middleware.ts)

const baseClient = createSafeActionClient({
  defineMetadataSchema() {
    return z.object({ name: z.string() });
  },
  defaultValidationErrorsShape: "flattened",
  handleServerError(error, { metadata, ctx, bindArgsClientInputs }) {
    const context = ctx as
      | {
          logger: ReturnType<typeof createScopedLogger>;
          requestId: string;
          userId?: string;
          userEmail?: string;
          emailAccountId?: string;
        }
      | undefined;

    const logger =
      context?.logger ??
      createScopedLogger(metadata?.name || "safe-action").with({
        requestId: context?.requestId,
        userId: context?.userId,
        userEmail: context?.userEmail,
        emailAccountId: context?.emailAccountId,
      });
    logger.error("Server action error:", {
      metadata,
      bindArgsClientInputs,
      error,
    });
    after(async () => {
      await flushLoggerSafely(logger, {
        action: metadata?.name,
        flushReason: "server-action-error",
        requestId: context?.requestId,
      });
    });

    if (env.NODE_ENV !== "production") {
      // biome-ignore lint/suspicious/noConsole: helpful for debugging
      console.error("Error in server action", error);
    }
    if (error instanceof SafeError) return error.message;

    captureException(error, {
      userId: context?.userId,
      userEmail: context?.userEmail,
      emailAccountId: context?.emailAccountId,
      extra: {
        metadata,
        bindArgsClientInputs,
        error: error.message,
      },
    });

    return "An unknown error occurred.";
  },
}).use(async ({ next, metadata }) => {
  const requestId = randomUUID();
  const logger = createScopedLogger(metadata.name).with({ requestId });

  return runWithAuditContext(
    {
      actorType: "anonymous",
      requestId,
      source: metadata.name,
    },
    async () => {
      after(async () => {
        await flushLoggerSafely(logger, {
          action: metadata.name,
          requestId,
        });
      });

      const result = await next({ ctx: { logger, requestId } });

      if (result.validationErrors) {
        logger.warn("Action validation error", {
          action: metadata.name,
          validationErrors: result.validationErrors,
        });
      }

      return result;
    },
  );
});

export const actionClient = baseClient
  .bindArgsSchemas<[emailAccountId: z.ZodString]>([z.string()])
  .use(async ({ next, metadata, bindArgsClientInputs, ctx }) => {
    const session = await auth();

    if (!session?.user) throw new SafeError("Unauthorized");
    const userEmail = session.user.email;
    if (!userEmail) throw new SafeError("Unauthorized");

    const userId = session.user.id;
    const emailAccountId = bindArgsClientInputs[0] as string;
    setAuditContext({ actorType: "user", userId });

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
    if (!emailAccount || emailAccount?.account.userId !== userId) {
      ctx.logger.error("Unauthorized", metadata);
      throw new SafeError("Unauthorized");
    }

    Sentry.setTag("emailAccountId", emailAccountId);
    Sentry.setUser({ id: userId, email: userEmail });
    setAuditContext({
      actorType: "email_account",
      emailAccountId,
      userId,
    });

    const logger = ctx.logger.with({
      userId,
      userEmail,
      emailAccountId,
      provider: emailAccount.account.provider,
    });
    logger.info("Calling action");

    return withServerActionInstrumentation(metadata.name, async () =>
      next({
        ctx: {
          ...ctx,
          logger,
          userId,
          userEmail,
          session,
          emailAccountId,
          emailAccount,
          provider: emailAccount.account.provider,
        },
      }),
    );
  });

// doesn't bind to a specific email
export const actionClientUser = baseClient.use(
  async ({ next, metadata, ctx }) => {
    const session = await auth();

    if (!session?.user) {
      ctx.logger.error("Unauthorized", metadata);
      captureException(new Error(`Unauthorized: ${metadata.name}`), {
        extra: metadata,
      });
      throw new SafeError("Unauthorized");
    }

    const userId = session.user.id;
    const userEmail = session.user.email;
    setAuditContext({ actorType: "user", userId });

    const logger = ctx.logger.with({ userId, userEmail });
    logger.info("Calling action");

    return withServerActionInstrumentation(metadata?.name, async () =>
      next({
        ctx: { ...ctx, userId, userEmail, logger },
      }),
    );
  },
);

export const adminActionClient = baseClient.use(
  async ({ next, metadata, ctx }) => {
    const session = await auth();
    if (!session?.user) throw new SafeError("Unauthorized");
    if (!isAdmin({ email: session.user.email }))
      throw new SafeError("Unauthorized");
    setAuditContext({ actorType: "admin", userId: session.user.id });

    const logger = ctx.logger.with({ admin: true });

    return withServerActionInstrumentation(metadata?.name, async () =>
      next({ ctx: { ...ctx, logger } }),
    );
  },
);
