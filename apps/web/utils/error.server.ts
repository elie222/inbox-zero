import { setUser } from "@sentry/nextjs";
import { posthogCaptureEvent } from "@/utils/posthog";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("error.server");

export async function logErrorToPosthog(
  type: "api" | "action",
  url: string,
  errorType: string,
) {
  try {
    const session = await auth();
    if (session?.user.email) {
      setUser({ email: session.user.email });
      await posthogCaptureEvent(session.user.email, errorType, {
        $set: { isError: true, type, url },
      });
    }
  } catch (error) {
    logger.error("Error logging to PostHog:", { error });
  }
}
