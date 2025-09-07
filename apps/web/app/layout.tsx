import { Suspense } from "react";
import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AxiomWebVitals } from "next-axiom";
import { GoogleTagManager } from "@next/third-parties/google";
import { Analytics as DubAnalytics } from "@dub/analytics/react";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "../styles/globals.css";
import { PostHogPageview, PostHogProvider } from "@/providers/PostHogProvider";
import { env } from "@/env";
import { GlobalProviders } from "@/providers/GlobalProviders";
import { UTM } from "@/app/utm";
import { startupImage } from "@/app/startup-image";

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

const title = "Inbox Zero | Automate and clean your inbox";
const description =
  "Your AI executive assistant to reach inbox zero fast. Automate emails, bulk unsubscribe, block cold emails, and analytics. Open-source";

// JSON-LD structured data
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Inbox Zero",
  url: env.NEXT_PUBLIC_BASE_URL,
  description,
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web Browser",
  offers: {
    "@type": "Offer",
    price: "20.00",
    priceCurrency: "USD",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: 20,
      priceCurrency: "USD",
      billingDuration: "P1M",
    },
    availability: "https://schema.org/InStock",
  },
  featureList: [
    "AI Email Assistant",
    "Email Automation",
    "Bulk Unsubscribe",
    "Cold Email Blocking",
    "Email Analytics",
    "Newsletter Management",
  ],
  publisher: {
    "@type": "Organization",
    name: "Inbox Zero",
    url: env.NEXT_PUBLIC_BASE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${env.NEXT_PUBLIC_BASE_URL}/icon.png`,
    },
    sameAs: [
      "https://x.com/inboxzero_ai",
      "https://github.com/elie222/inbox-zero",
    ],
  },
};

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "Inbox Zero",
    type: "website",
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
  // pwa
  applicationName: "Inbox Zero",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Inbox Zero",
    startupImage,
  },
  formatDetection: {
    telephone: false,
  },
  // safe area for iOS PWA
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "white-translucent",
  },
};

export const viewport = {
  themeColor: "#FFF",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        className={`h-full ${inter.variable} ${calFont.variable} font-sans antialiased`}
      >
        <Script
          id="json-ld"
          type="application/ld+json"
          strategy="beforeInteractive"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON.stringify on controlled object is safe
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd),
          }}
        />
        <PostHogProvider>
          <Suspense>
            <PostHogPageview />
          </Suspense>
          <GlobalProviders>{children}</GlobalProviders>
        </PostHogProvider>
        <Analytics />
        <AxiomWebVitals />
        <UTM />
        <SpeedInsights />
        {env.NEXT_PUBLIC_DUB_REFER_DOMAIN && (
          <DubAnalytics
            apiHost="/_proxy/dub"
            scriptProps={{ src: "/_proxy/dub/script.js" }}
            domainsConfig={{ refer: env.NEXT_PUBLIC_DUB_REFER_DOMAIN }}
          />
        )}
        {env.NEXT_PUBLIC_GTM_ID ? (
          <GoogleTagManager gtmId={env.NEXT_PUBLIC_GTM_ID} />
        ) : null}
      </body>
    </html>
  );
}
