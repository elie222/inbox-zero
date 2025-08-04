import "../../styles/globals.css";
import type React from "react";
import { cookies } from "next/headers";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { SideNavWithTopNav } from "@/components/SideNavWithTopNav";
import { TokenCheck } from "@/components/TokenCheck";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { PostHogIdentify } from "@/providers/PostHogProvider";
import { CommandK } from "@/components/CommandK";
import { AppProviders } from "@/providers/AppProviders";
import { AssessUser } from "@/app/(app)/[emailAccountId]/assess";
import { LastLogin } from "@/app/(app)/last-login";
import { SentryIdentify } from "@/app/(app)/sentry-identify";
import { ErrorMessages } from "@/app/(app)/ErrorMessages";
import { QueueInitializer } from "@/store/QueueInitializer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EmailViewer } from "@/components/EmailViewer";

export const viewport = {
  themeColor: "#FFF",
  // safe area for iOS PWA
  userScalable: false,
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  width: "device-width",
  height: "device-height",
  viewportFit: "cover",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user.email) redirect("/login");

  const cookieStore = await cookies();
  const isClosed = cookieStore.get("sidebar:state")?.value === "false";

  return (
    <AppProviders>
      <SideNavWithTopNav defaultOpen={!isClosed}>
        <ErrorMessages />
        {children}
      </SideNavWithTopNav>
      <EmailViewer />
      <ErrorBoundary extra={{ component: "AppLayout" }}>
        <PostHogIdentify />
        <TokenCheck />
        <CommandK />
        <QueueInitializer />
        <AssessUser />
        <SentryIdentify email={session.user.email} />
        <Suspense>
          <LastLogin email={session.user.email} />
        </Suspense>
        {/* <Suspense>
          <CrispWithNoSSR email={session.user.email} />
        </Suspense> */}
      </ErrorBoundary>
    </AppProviders>
  );
}

const CrispWithNoSSR = dynamic(() => import("@/components/CrispChat"));
