import { TopNav } from "@/components/TopNav";
import { Toaster } from "@/components/Toast";
import { NavBottom } from "@/components/NavBottom";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SideNav } from "@/components/SideNav";
import { SidebarRight } from "@/components/SidebarRight";

export function SideNavWithTopNav({
  children,
  defaultOpen,
}: {
  children: React.ReactNode;
  defaultOpen: boolean;
}) {
  return (
    <SidebarProvider
      defaultOpen={defaultOpen ? ["left-sidebar"] : []}
      sidebarNames={["left-sidebar", "chat-sidebar"]}
    >
      <SideNav name="left-sidebar" />
      <SidebarInset className="overflow-hidden bg-background">
        <TopNav
          trigger={<SidebarTrigger name="left-sidebar" className="sm:-ml-4" />}
        />
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
