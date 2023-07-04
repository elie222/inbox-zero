import { SWRProvider } from "@/utils/SWR";
import "../globals.css";
import { Inter } from "next/font/google";
import { NotificationProvider } from "@/components/NotificationProvider";
import { SideNav } from "@/components/SideNav";
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
          <NotificationProvider>
            <SideNav>{children}</SideNav>
          </NotificationProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
