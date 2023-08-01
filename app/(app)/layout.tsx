import "../../styles/globals.css";
import React from "react";
import { redirect } from "next/navigation";
import { GmailProvider } from "@/providers/GmailProvider";
import { SessionProvider } from "@/providers/SessionProvider";
import { SideNavWithTopNav } from "@/components/SideNavWithTopNav";
// import { PromptProvider } from "@/providers/PromptProvider";
import { SWRProvider } from "@/providers/SWRProvider";
import { getAuthSession } from "@/utils/auth";

export const metadata = {
  title: "Inbox Zero AI",
  description:
    "Reach inbox zero in minutes. Inbox Zero uses AI to help you empty your inbox daily. What previously took hours, now takes minutes. Inbox Zero is your VA for emails.",
};

// NOTE: inherits from top level layout
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();

  if (!session?.user.email) redirect("/api/auth/signin");

  return (
    <html lang="en">
      <body>
        <SWRProvider>
          <GmailProvider>
            <SessionProvider>
              <SideNavWithTopNav>{children}</SideNavWithTopNav>
            </SessionProvider>
          </GmailProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
