import { redirect } from "next/navigation";
import { auth } from "@/utils/auth";
import prisma from "@/utils/prisma";

export default async function WelcomeRedirectPage(props: {
  searchParams: Promise<{ force?: boolean }>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();

  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { completedOnboardingAt: true, utms: true },
  });

  // Session exists but user doesn't - invalid state, log out
  if (!user) redirect("/logout");

  // Check if user has any email accounts
  // Users who logged in with auth-only providers (like Authelia) won't have one yet
  const emailAccount = await prisma.emailAccount.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });

  // No email account yet - redirect to accounts page to add one
  if (!emailAccount) redirect("/accounts");

  if (searchParams.force) redirect("/onboarding");
  if (user.completedOnboardingAt) redirect("/setup");
  redirect("/onboarding");
}
