import { setUser } from "@sentry/nextjs";
import { trackError } from "@/utils/posthog";
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
      await trackError({ email: session.user.email, errorType, type, url });
    }
  } catch (error) {
    logger.error("Error logging to PostHog:", { error });
  }
}
