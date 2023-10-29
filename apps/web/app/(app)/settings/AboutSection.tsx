import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { AboutSectionForm } from "@/app/(app)/settings/AboutSectionForm";
import { NotLoggedIn } from "@/components/ErrorDisplay";

export const AboutSection = async () => {
  const session = await auth();

  if (!session?.user.email) return <NotLoggedIn />;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) return <NotLoggedIn />;

  return <AboutSectionForm about={user.about ?? undefined} />;
};
