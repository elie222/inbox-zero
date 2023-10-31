import "../../styles/globals.css";
import React from "react";
import { redirect } from "next/navigation";
import { SideNavWithTopNav } from "@/components/SideNavWithTopNav";
import { TokenCheck } from "@/components/TokenCheck";
import Providers from "@/app/(app)/providers";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user.email) redirect("/login");

  return (
    <Providers>
      <TokenCheck />
      <SideNavWithTopNav>{children}</SideNavWithTopNav>
    </Providers>
  );
}
