import "../../styles/globals.css";
import type { Metadata } from "next";
import type React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Inter } from "next/font/google";
import { SideNavWithTopNav } from "@/components/SideNavWithTopNav";
import {
  CHAT_SIDEBAR_DEFAULT_WIDTH,
  CHAT_SIDEBAR_WIDTH_BOUNDS,
  CHAT_SIDEBAR_WIDTH_COOKIE,
} from "@/components/chat-sidebar-width";
import { auth } from "@/utils/auth";
import { PostHogIdentify } from "@/providers/PostHogProvider";
import { CommandK } from "@/components/CommandK";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { AppProviders } from "@/providers/AppProviders";
import { AssessUser } from "@/app/(app)/[emailAccountId]/assess";
import { SentryIdentify } from "@/app/(app)/sentry-identify";
import { AiAutomationStatusBanner } from "@/app/(app)/AiAutomationStatusBanner";
import { ErrorMessages } from "@/app/(app)/ErrorMessages";
import { DesktopMailIndicators } from "@/app/(app)/DesktopMailIndicators";
import { DesktopUpdateToast } from "@/app/(app)/DesktopUpdateToast";
import { ProviderRateLimitBanner } from "@/app/(app)/ProviderRateLimitBanner";
import { MailEngineRuntime } from "@/utils/mail-engine/MailEngineHost";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EmailViewer } from "@/components/EmailViewer";
import { SettingsDialog } from "@/app/(app)/settings/SettingsDialog";
import { AnnouncementDialog } from "@/components/feature-announcements/AnnouncementDialog";
import { captureException } from "@/utils/error";
import { parsePanelWidthCookie } from "@/utils/panel-width";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { booleanString } from "@/utils/zod";

const logger = createScopedLogger("AppLayout");

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  preload: true,
  display: "swap",
});

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

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
  const chatSidebarWidth =
    parsePanelWidthCookie(
      cookieStore.get(CHAT_SIDEBAR_WIDTH_COOKIE)?.value,
      CHAT_SIDEBAR_WIDTH_BOUNDS,
    ) ?? CHAT_SIDEBAR_DEFAULT_WIDTH;
  const bypassPremiumChecks =
    booleanString.parse(process.env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) ?? false;
  const feedbackEnabled =
    !bypassPremiumChecks || Boolean(process.env.FEEDBACK_WEBHOOK_URL);

  after(async () => {
    const userId = session.user.id;
    try {
      // updateMany: a cached session can briefly outlive a merged or deleted user.
      await prisma.user.updateMany({
        where: { id: userId },
        data: { lastLogin: new Date() },
      });
    } catch (error) {
      logger.error("Failed to update last login", { userId, error });
      captureException(error, { userId });
    }
  });

  return (
    <div className={inter.variable}>
      <div className="font-inter">
        <AppProviders>
          <MailEngineRuntime>
            <SideNavWithTopNav
              defaultOpen={!isClosed}
              feedbackEnabled={feedbackEnabled}
              chatSidebarWidth={chatSidebarWidth}
            >
              <DesktopMailIndicators />
              <DesktopUpdateToast />
              <AiAutomationStatusBanner />
              <ErrorMessages />
              <ProviderRateLimitBanner />
              {children}
            </SideNavWithTopNav>
            <EmailViewer />
            <SettingsDialog />
            <AnnouncementDialog />
            {feedbackEnabled && <FeedbackDialog />}
            <ErrorBoundary extra={{ component: "AppLayout" }}>
              <PostHogIdentify />

              <CommandK feedbackEnabled={feedbackEnabled} />
              <AssessUser />
              <SentryIdentify email={session.user.email} />
            </ErrorBoundary>
          </MailEngineRuntime>
        </AppProviders>
      </div>
    </div>
  );
}
