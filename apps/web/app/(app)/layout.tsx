import "../../styles/globals.css";
import React from "react";
import { redirect } from "next/navigation";
import { SideNavWithTopNav } from "@/components/SideNavWithTopNav";
import { getAuthSession } from "@/utils/auth";
import { TokenCheck } from "@/components/TokenCheck";
import Providers from "@/app/(app)/providers";

// NOTE: inherits from top level layout
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();

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
