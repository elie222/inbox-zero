import { captureException } from "@/utils/error";
import { createClientLogger } from "@/utils/logger-client";
import type { MailEngineRuntimeMode } from "./runtime-mode";
import {
  MailEngineStartupError,
  type MailEngineStartupStage,
} from "./startup-error";
import type { browserMailEngineCapabilities } from "./worker-protocol";

const logger = createClientLogger("mail-engine");

export function reportMailEngineStartupFailure(
  error: unknown,
  context: {
    runtimeMode: MailEngineRuntimeMode;
    platform: "web" | "desktop";
    capabilities: ReturnType<typeof browserMailEngineCapabilities>;
    stage: MailEngineStartupStage;
  },
) {
  const failure =
    error instanceof MailEngineStartupError
      ? error
      : new MailEngineStartupError(context.stage, error);
  const tags = {
    runtimeMode: context.runtimeMode,
    platform: context.platform,
    stage: failure.stage,
  };
  captureException(failure, { tags, extra: context.capabilities });
  logger.error("Mail engine failed to start", {
    error: { name: failure.name, message: failure.message },
    ...tags,
    ...context.capabilities,
  });
  logger.flush().catch(() => undefined);
}
