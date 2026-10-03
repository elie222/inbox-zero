import { NextResponse } from "next/server";
import { env } from "@/env";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { withEmailProvider } from "@/utils/middleware";
import {
  getCachedContactPhotos,
  setCachedContactPhotos,
} from "@/utils/redis/contact-photos";

export type ContactPhotosResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailProvider(
  "user/contacts/photos",
  async (request) => {
    if (!env.NEXT_PUBLIC_CONTACTS_ENABLED) {
      return NextResponse.json(
        { error: "Contacts API not enabled" },
        { status: 404 },
      );
    }

    const result = await getData({
      emailAccountId: request.auth.emailAccountId,
      emailProvider: request.emailProvider,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);

async function getData({
  emailAccountId,
  emailProvider,
  logger,
}: {
  emailAccountId: string;
  emailProvider: Pick<EmailProvider, "getContactPhotos">;
  logger: Logger;
}) {
  const cached = await getCachedContactPhotos(emailAccountId, logger);
  if (cached) return { photos: cached };

  const photos = await emailProvider.getContactPhotos();
  await setCachedContactPhotos(emailAccountId, photos, logger);
  return { photos };
}
