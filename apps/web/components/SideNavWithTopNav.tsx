"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Toaster } from "@/components/Toast";
import { NavBottom } from "@/components/NavBottom";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { SideNav } from "@/components/SideNav";
import { SidebarRight } from "@/components/SidebarRight";
import { cn } from "@/utils";

const CrispWithNoSSR = dynamic(() => import("@/components/CrispChat"));

function ContentWrapper({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar();
  const isRightSidebarOpen = state.includes("chat-sidebar");

  return (
    <div
      className={cn(
        "flex-1 transition-all duration-200 ease-linear",
        isRightSidebarOpen && "lg:mr-[450px]",
      )}
    >
      <SidebarInset className="overflow-hidden bg-background pt-9 max-w-full">
        <Toaster closeButton richColors theme="light" visibleToasts={9} />
        {children}
        <div
          className="md:hidden md:pt-0"
          style={{ paddingTop: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <NavBottom />
        </div>
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

  // Ugly code. May change the onboarding path later so we don't need to do this.
  // Only return children for the main onboarding page: /[emailAccountId]/onboarding
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 2 && segments[1] === "onboarding") return children;

  return (
    <SidebarProvider
      defaultOpen={defaultOpen ? ["left-sidebar"] : []}
      sidebarNames={["left-sidebar", "chat-sidebar"]}
    >
      <MobileHeader />
      <SideNav name="left-sidebar" />
      <ContentWrapper>{children}</ContentWrapper>
      <SidebarRight name="chat-sidebar" />
    </SidebarProvider>
  );
}

function MobileHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-9 md:hidden">
      <div className="flex h-full items-center px-4">
        <SidebarTrigger name="left-sidebar" className="size-6" />
      </div>
    </header>
  );
}
