import "server-only";
import type { Logger } from "@/utils/logger";
import { redis } from "@/utils/redis";

// Contact photos rarely change, and sweeping the address book is expensive
// against the provider's per-user quota.
const CONTACT_PHOTOS_TTL_SECONDS = 24 * 60 * 60;

export async function getCachedContactPhotos(
  emailAccountId: string,
  logger: Logger,
) {
  try {
    return await redis.get<Record<string, string>>(
      getContactPhotosKey(emailAccountId),
    );
  } catch (error) {
    logger.warn("Failed to read cached contact photos", { error });
    return null;
  }
}

export async function setCachedContactPhotos(
  emailAccountId: string,
  photos: Record<string, string>,
  logger: Logger,
) {
  try {
    await redis.set(getContactPhotosKey(emailAccountId), photos, {
      ex: CONTACT_PHOTOS_TTL_SECONDS,
    });
  } catch (error) {
    logger.warn("Failed to cache contact photos", { error });
  }
}

function getContactPhotosKey(emailAccountId: string) {
  return `contact-photos:${emailAccountId}`;
}
