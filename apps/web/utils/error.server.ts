import { setUser } from "@sentry/nextjs";
import { trackError } from "@/utils/posthog";
import { auth } from "@/utils/auth";
import { headers } from "next/headers";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("error.server");

export async function logErrorToPosthog(
  type: "api" | "action",
  url: string,
  errorType: string,
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user.email) {
      setUser({ email: session.user.email });
      await trackError({ email: session.user.email, errorType, type, url });
    }
  } catch (error) {
    logger.error("Error logging to PostHog:", { error });
  }
}
