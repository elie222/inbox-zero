import { getSession } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { LabelsSectionForm } from "@/app/mail/settings/LabelsSectionForm";
import { NotLoggedIn } from "@/components/ErrorDisplay";

export const LabelsSection = async () => {
  const session = await getSession();

  if (!session?.user) return <NotLoggedIn />;

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: session.user.email },
    select: { labels: true },
  });

  return <LabelsSectionForm enabledLabels={user.labels} />;
};
