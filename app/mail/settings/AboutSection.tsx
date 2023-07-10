import { getSession } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { AboutSectionForm } from "@/app/mail/settings/AboutSectionForm";
import { NotLoggedIn } from "@/components/ErrorDisplay";

export const AboutSection = async () => {
  const session = await getSession();

  if (!session?.user) return <NotLoggedIn />;

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: session.user.email },
  });

  return <AboutSectionForm about={user.about ?? undefined} />;
};
