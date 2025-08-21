"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "@/components/Toast";
import { NavBottom } from "@/components/NavBottom";
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { SideNav } from "@/components/SideNav";
import { SidebarRight } from "@/components/SidebarRight";
import { cn } from "@/utils";

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
      <SideNav name="left-sidebar" />
      <ContentWrapper>{children}</ContentWrapper>
      <SidebarRight name="chat-sidebar" />
    </SidebarProvider>
  );
}
