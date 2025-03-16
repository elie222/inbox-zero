import { cookies } from "next/headers";
import prisma from "@/utils/prisma";

async function storeUtms(userId: string) {
  const cookieStore = await cookies();
  const utmCampaign = cookieStore.get("utm_campaign");
  const utmMedium = cookieStore.get("utm_medium");
  const utmSource = cookieStore.get("utm_source");
  const utmTerm = cookieStore.get("utm_term");

  const utms = {
    utmCampaign: utmCampaign?.value,
    utmMedium: utmMedium?.value,
    utmSource: utmSource?.value,
    utmTerm: utmTerm?.value,
  };

  await prisma.user.update({
    where: { id: userId },
    data: { utms },
  });
}

export async function UTMs({ userId }: { userId: string }) {
  await storeUtms(userId);

  return null;
}
