"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { SideNav } from "@/components/SideNav";
import { SidebarRight } from "@/components/SidebarRight";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import { getActiveAppId, getAppHref, getVisibleApps } from "@/utils/apps";
import { useUser } from "@/hooks/useUser";

const CrispWithNoSSR = dynamic(() => import("@/components/CrispChat"));

function ContentWrapper({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar();
  const pathname = usePathname();
  const isAssistantRoute = pathname?.includes("/assistant");
  const isRightSidebarOpen =
    !isAssistantRoute && state.includes("chat-sidebar");

  const noTopPadding = isAssistantRoute;

  return (
    <div
      className={cn(
        "min-w-0 flex-1 transition-all duration-200 ease-linear",
        isRightSidebarOpen && "lg:mr-[450px]",
      )}
    >
      <SidebarInset
        className={cn(
          "overflow-hidden bg-background pt-[calc(2.25rem_+_env(safe-area-inset-top))] max-w-full",
          // Leave room for the mobile bottom app tray
          "pb-14 md:pb-0",
          noTopPadding && "pt-0",
        )}
      >
        {children}
      </SidebarInset>
      <Suspense>
        <CrispWithNoSSR />
      </Suspense>
    </div>
  );
}

export function SideNavWithTopNav({
  children,
  defaultOpen,
}: {
  children: React.ReactNode;
  defaultOpen: boolean;
}) {
  const pathname = usePathname();

  if (!pathname) return null;

  const isAssistantRoute = pathname.includes("/assistant");

  // Ugly code. May change the onboarding path later so we don't need to do this.
  // Only return children for the onboarding or onboarding-brief pages: /[emailAccountId]/onboarding or /[emailAccountId]/onboarding-brief
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length === 2 &&
    (segments[1] === "onboarding" || segments[1] === "onboarding-brief")
  )
    return children;

  return (
    <SidebarProvider
      defaultOpen={defaultOpen ? ["left-sidebar"] : []}
      sidebarNames={["left-sidebar", "chat-sidebar"]}
    >
      <MobileHeader />
      <SideNav name="left-sidebar" />
      <ContentWrapper>{children}</ContentWrapper>
      {!isAssistantRoute ? <SidebarRight name="chat-sidebar" /> : null}
      <MobileAppTray />
    </SidebarProvider>
  );
}

// Bottom app switcher on mobile; desktop uses the sidebar's icon rail
function MobileAppTray() {
  const pathname = usePathname();
  const { emailAccountId } = useAccount();
  const { data: user } = useUser();
  const activeApp = getActiveAppId(pathname ?? "");
  const apps = getVisibleApps({ isAdmin: Boolean(user?.isAdmin) });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden">
      {apps.map((app) => (
        <Link
          key={app.id}
          href={getAppHref(emailAccountId, app)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium text-sidebar-foreground/70",
            app.id === activeApp && "text-sidebar-accent-foreground",
          )}
        >
          <app.icon className="size-5" />
          {app.name}
        </Link>
      ))}
    </nav>
  );
}

function MobileHeader() {
  return (
    <header className="pointer-events-none fixed top-0 left-0 right-0 z-50 h-[calc(2.25rem_+_env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] md:hidden">
      <div className="flex h-full items-center px-4">
        <SidebarTrigger
          name="left-sidebar"
          className="pointer-events-auto size-9"
        />
      </div>
    </header>
  );
}
