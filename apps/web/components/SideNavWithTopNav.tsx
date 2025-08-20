"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "@/components/Toast";
import { NavBottom } from "@/components/NavBottom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SideNav } from "@/components/SideNav";
import { SidebarRight } from "@/components/SidebarRight";

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
      <SidebarInset className="overflow-hidden bg-background pt-9">
        <Toaster closeButton richColors theme="light" visibleToasts={9} />
        {children}
        <div
          className="md:hidden md:pt-0"
          style={{ paddingTop: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <NavBottom />
        </div>
      </SidebarInset>
      <SidebarRight name="chat-sidebar" />
    </SidebarProvider>
  );
}
