import { getSession } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { AboutSectionForm } from "@/app/mail/settings/AboutSectionForm";

export const AboutSection = async () => {
  const session = await getSession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: session?.user.email },
  });

  return <AboutSectionForm about={user.about ?? undefined} />;
};
