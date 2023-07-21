import { getAuthSession } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { AboutSectionForm } from "@/app/mail/settings/AboutSectionForm";
import { NotLoggedIn } from "@/components/ErrorDisplay";

export const AboutSection = async () => {
  const session = await getAuthSession();

  if (!session?.user) return <NotLoggedIn />;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) return <NotLoggedIn />;

  return <AboutSectionForm about={user.about ?? undefined} />;
};
