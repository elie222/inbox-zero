import { cookies } from "next/headers";
import { TopNav } from "@/components/TopNav";
import { Toaster } from "@/components/Toast";
import { NavBottom } from "@/components/NavBottom";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/SideNav";

export function SideNavWithTopNav({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const isClosed = cookieStore.get("sidebar_state")?.value === "false";

  return (
    <SidebarProvider defaultOpen={!isClosed}>
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <TopNav trigger={<SidebarTrigger className="sm:-ml-4" />} />
        <Toaster closeButton richColors theme="light" visibleToasts={9} />
        {children}
        <div
          className="md:hidden md:pt-0"
          style={{ paddingTop: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <NavBottom />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
