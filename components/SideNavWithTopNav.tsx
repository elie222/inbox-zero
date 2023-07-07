"use client";

import { useState } from "react";
import { SideNav } from "@/components/SideNav";
import { TopNav } from "@/components/TopNav";

export function SideNavWithTopNav(props: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SideNav
      topBar={<TopNav setSidebarOpen={setSidebarOpen} />}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    >
      {props.children}
    </SideNav>
  );
}
