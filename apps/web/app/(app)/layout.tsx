import "../../styles/globals.css";
import type React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { SideNavWithTopNav } from "@/components/SideNavWithTopNav";
import { auth } from "@/utils/auth";
import { PostHogIdentify } from "@/providers/PostHogProvider";
import { CommandK } from "@/components/CommandK";
import { AppProviders } from "@/providers/AppProviders";
import { AssessUser } from "@/app/(app)/[emailAccountId]/assess";
import { SentryIdentify } from "@/app/(app)/sentry-identify";
import { ErrorMessages } from "@/app/(app)/ErrorMessages";
import { QueueInitializer } from "@/store/QueueInitializer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EmailViewer } from "@/components/EmailViewer";
import { captureException } from "@/utils/error";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("AppLayout");

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
  const isClosed = cookieStore.get("left-sidebar:state")?.value === "false";

  after(async () => {
    const email = session.user.email;
    try {
      await prisma.user.update({
        where: { email },
        data: { lastLogin: new Date() },
      });
    } catch (error) {
      logger.error("Failed to update last login", { email, error });
      captureException(error, {}, email);
    }
  });

  return (
    <AppProviders>
      <SideNavWithTopNav defaultOpen={!isClosed}>
        <ErrorMessages />
        {children}
      </SideNavWithTopNav>
      <EmailViewer />
      <ErrorBoundary extra={{ component: "AppLayout" }}>
        <PostHogIdentify />

        <CommandK />
        <QueueInitializer />
        <AssessUser />
        <SentryIdentify email={session.user.email} />
        {/* <Suspense>
          <CrispWithNoSSR email={session.user.email} />
        </Suspense> */}
      </ErrorBoundary>
    </AppProviders>
  );
}

// const CrispWithNoSSR = dynamic(() => import("@/components/CrispChat"));
