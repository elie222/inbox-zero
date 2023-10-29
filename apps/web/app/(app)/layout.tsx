import "../../styles/globals.css";
import React from "react";
import { redirect } from "next/navigation";
import { SideNavWithTopNav } from "@/components/SideNavWithTopNav";
// import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { TokenCheck } from "@/components/TokenCheck";
import Providers from "@/app/(app)/providers";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

// NOTE: inherits from top level layout
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user.email) redirect("/login");

  return (
    <html lang="en">
      <body>
        <Providers>
          <TokenCheck />
          <SideNavWithTopNav>{children}</SideNavWithTopNav>
        </Providers>
      </body>
    </html>
  );
}
