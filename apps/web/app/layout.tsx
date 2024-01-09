import { Metadata } from "next";
import { Suspense } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PostHogPageview, PostHogProvider } from "@/providers/PostHogProvider";
import "../styles/globals.css";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { env } from "@/env.mjs";
import Providers from "@/app/(app)/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  preload: true,
  display: "swap",
});
const calFont = localFont({
  src: "../styles/CalSans-SemiBold.woff2",
  variable: "--font-cal",
  preload: true,
  display: "swap",
});

const title = "Inbox Zero";
const description =
  "Clean your inbox in minutes. Inbox Zero is the quickest way to reach inbox zero, with our newsletter cleaner, AI automation, and email analytics.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    creator: "@inboxzero_ai",
  },
  metadataBase: new URL(env.NEXT_PUBLIC_BASE_URL),
  // issues with robots.txt: https://github.com/vercel/next.js/issues/58615#issuecomment-1852457285
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  themeColor: "#FFF",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`h-full ${inter.variable} ${calFont.variable} font-sans antialiased`}
      >
        <PostHogProvider>
          <Suspense>
            <PostHogPageview />
          </Suspense>
          <Providers>{children}</Providers>
        </PostHogProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
