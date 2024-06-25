import "../../styles/globals.css";
import type React from "react";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { SideNavWithTopNav } from "@/components/SideNavWithTopNav";
import { TokenCheck } from "@/components/TokenCheck";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { PostHogIdentify } from "@/providers/PostHogProvider";
import { CommandK } from "@/components/CommandK";
import { AppProviders } from "@/providers/AppProviders";
import { AssessUser } from "@/app/(app)/assess";
import { LastLogin } from "@/app/(app)/last-login";
import { SentryIdentify } from "@/app/(app)/sentry-identify";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user.email) redirect("/login");

  return (
    <AppProviders>
      <PostHogIdentify />
      <TokenCheck />
      <CommandK />
      <SideNavWithTopNav>{children}</SideNavWithTopNav>
      <Suspense>
        <AssessUser />
        <SentryIdentify email={session.user.email} />
        <LastLogin email={session.user.email} />
      </Suspense>
      <Suspense>
        <CrispWithNoSSR email={session.user.email} />
      </Suspense>
    </AppProviders>
  );
}

const CrispWithNoSSR = dynamic(() => import("@/components/CrispChat"));
