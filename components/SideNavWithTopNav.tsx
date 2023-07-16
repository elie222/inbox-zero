"use client";

import { useState } from "react";
import { SideNav } from "@/components/SideNav";
import { TopNav } from "@/components/TopNav";
import { Toaster } from "@/components/Toast";

export function SideNavWithTopNav(props: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SideNav
      topBar={<TopNav setSidebarOpen={setSidebarOpen} />}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    >
      <Toaster
        expand
        position="top-right"
        closeButton
        richColors
        theme="light"
        visibleToasts={9}
      />
      {props.children}
    </SideNav>
  );
}
