import type { NextRequest } from "next/server";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";

/**
 * Extracts and validates a session token from the Authorization header.
 * Used for mobile app authentication.
 *
 * @param request - The incoming request
 * @param logger - Logger instance from middleware
 * @returns The user ID if valid, null otherwise
 */
export async function validateMobileSession(
  request: NextRequest,
  logger: Logger,
): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return null;
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    return null;
  }

  try {
    const session = await prisma.session.findFirst({
      where: {
        sessionToken: token,
        expires: { gt: new Date() },
      },
      select: {
        userId: true,
      },
    });

    if (!session) {
      logger.trace("Mobile session token not found or expired");
      return null;
    }

    logger.trace("Mobile session validated", { userId: session.userId });
    return { userId: session.userId };
  } catch (error) {
    logger.error("Error validating mobile session", { error });
    return null;
  }
}
