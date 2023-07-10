import "../globals.css";
import { Inter } from "next/font/google";
import { NotificationProvider } from "@/providers/NotificationProvider";
import { GmailProvider } from "@/providers/GmailProvider";
import { SessionProvider } from "@/providers/SessionProvider";
import { SideNavWithTopNav } from "@/components/SideNavWithTopNav";
import { PromptProvider } from "@/providers/PromptProvider";
import { SWRProvider } from "@/providers/SWRProvider";
// import localFont from "next/font/local";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  preload: true,
  display: "swap",
});
// const calFont = localFont({
//   src: "../fonts/CalSans-SemiBold.woff2",
//   variable: "--font-cal",
//   preload: true,
//   display: "swap",
// });

export const metadata = {
  title: "Get Inbox Zero AI",
  description: "Get to Inbox Zero with AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SWRProvider>
          <GmailProvider>
            <NotificationProvider>
              <SessionProvider>
                <PromptProvider>
                  <SideNavWithTopNav>{children}</SideNavWithTopNav>
                </PromptProvider>
              </SessionProvider>
            </NotificationProvider>
          </GmailProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
