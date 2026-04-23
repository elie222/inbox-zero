import { withError } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";
import {
  executeAutomationJobBody,
  executeAutomationJobRun,
} from "@/utils/automation-jobs/execute";

export const maxDuration = 300;

export const POST = withError(
  "automation-jobs/execute",
  withQstashOrInternal(async (request) => {
    const logger = request.logger;

    const rawPayload = await request.json();
    const validation = executeAutomationJobBody.safeParse(rawPayload);

    if (!validation.success) {
      logger.error("Invalid automation job execute payload", {
        errors: validation.error.issues,
      });
      return new Response("Invalid payload", { status: 400 });
    }

    return executeAutomationJobRun({
      automationJobRunId: validation.data.automationJobRunId,
      logger,
    });
  }),
);
