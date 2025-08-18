import { cookies } from "next/headers";
import prisma from "@/utils/prisma";

export async function storeUtms(userId: string) {
  const cookieStore = await cookies();
  const utmCampaign = cookieStore.get("utm_campaign");
  const utmMedium = cookieStore.get("utm_medium");
  const utmSource = cookieStore.get("utm_source");
  const utmTerm = cookieStore.get("utm_term");
  const affiliate = cookieStore.get("affiliate");

  const utms = {
    utmCampaign: utmCampaign?.value,
    utmMedium: utmMedium?.value,
    utmSource: utmSource?.value,
    utmTerm: utmTerm?.value,
    affiliate: affiliate?.value,
  };

  await prisma.user.update({
    where: { id: userId },
    data: { utms },
  });
}
