import { Suspense } from "react";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { after } from "next/server";
import { OnboardingForm } from "@/app/(landing)/welcome/form";
import { SquaresPattern } from "@/app/(landing)/home/SquaresPattern";
import { PageHeading, TypographyP } from "@/components/Typography";
import { CardBasic } from "@/components/ui/card";
import { fetchUserAndStoreUtms } from "@/app/(landing)/welcome/utms";
import { auth } from "@/utils/auth";

export const metadata: Metadata = {
  title: "Welcome",
  description: "Get started with Inbox Zero",
  alternates: { canonical: "/welcome" },
};

export default async function WelcomePage(props: {
  searchParams: Promise<{ question?: string; force?: boolean }>;
}) {
  const searchParams = await props.searchParams;

  const questionIndex = searchParams.question
    ? Number.parseInt(searchParams.question)
    : 0;

  const authPromise = auth();

  const cookieStore = await cookies();
  after(async () => {
    const user = await authPromise;
    if (!user?.user) return;
    await fetchUserAndStoreUtms(user.user.id, cookieStore);
  });

  return (
    <div className="flex flex-col justify-center px-6 py-20 text-gray-900">
      <SquaresPattern />

      <CardBasic className="mx-auto flex max-w-2xl flex-col justify-center space-y-6 p-10 duration-500 animate-in fade-in">
        <div className="flex flex-col text-center">
          <PageHeading>Welcome to Inbox Zero</PageHeading>
          <TypographyP className="mt-2">Let{"'"}s get you set up!</TypographyP>
          <div className="mt-4">
            <Suspense>
              <OnboardingForm questionIndex={questionIndex} />
            </Suspense>
          </div>
        </div>
      </CardBasic>
    </div>
  );
}
