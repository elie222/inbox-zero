"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { localMailSyncBody } from "@/utils/actions/local-mail-sync.validation";
import { createEmailProvider } from "@/utils/email/provider";
import {
  LocalMailSyncPausedError,
  normalizeThrottleHeaders,
} from "@/utils/email/local-mail-sync-budget";
import type { LocalMailSyncResponse } from "@/utils/email/local-mail-sync-types";
import { getProviderRateLimitDelayMs } from "@/utils/email/rate-limit";
import {
  ProviderRateLimitModeError,
  toRateLimitProvider,
} from "@/utils/email/rate-limit-mode-error";

export const localMailSyncAction = actionClient
  .metadata({ name: "localMailSync" })
  .inputSchema(localMailSyncBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput,
    }): Promise<LocalMailSyncResponse> => {
      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        return await emailProvider.syncLocalMail(parsedInput, {
          emailAccountId,
        });
      } catch (error) {
        if (error instanceof LocalMailSyncPausedError)
          return { status: "paused", retryAfterMs: error.retryAfterMs };
        if (error instanceof ProviderRateLimitModeError) {
          const retryAt = error.retryAt
            ? Date.parse(error.retryAt)
            : Number.NaN;
          return {
            status: "paused",
            retryAfterMs: Number.isFinite(retryAt)
              ? Math.max(1000, retryAt - Date.now())
              : 60_000,
          };
        }
        const rateLimitProvider = toRateLimitProvider(provider);
        if (rateLimitProvider) {
          const delay = getProviderRateLimitDelayMs({
            error: normalizeThrottleHeaders(error),
            provider: rateLimitProvider,
            attemptNumber: 1,
          });
          if (delay !== null)
            return { status: "paused", retryAfterMs: Math.max(1000, delay) };
        }
        throw error;
      }
    },
  );
