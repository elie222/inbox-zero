import { Dub } from "dub";
import { env } from "@/env";
import { cookies } from "next/headers";
import type { Logger } from "@/utils/logger";

function getDub() {
  if (!env.DUB_API_KEY) return null;
  return new Dub({ token: env.DUB_API_KEY });
}

export async function trackDubSignUp(
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  },
  logger: Logger,
) {
  const dub = getDub();
  if (!dub) return;

  const cookieStore = await cookies();
  const clickId = cookieStore.get("dub_id")?.value;

  if (!clickId) {
    logger.info("No dub_id cookie found");
    return;
  }

  await dub.track.lead({
    clickId,
    eventName: "Sign Up",
    customerExternalId: user.id ?? "missing-id",
    customerName: user.name,
    customerEmail: user.email,
    customerAvatar: user.image,
  });

  cookieStore.delete("dub_id");
  cookieStore.delete("dub_partner_data");
}
