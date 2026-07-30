import { Suspense } from "react";
import type { Metadata } from "next";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AxiomWebVitals } from "next-axiom";
import { GoogleTagManager } from "@next/third-parties/google";
import { Analytics as DubAnalytics } from "@dub/analytics/react";
import { Geist, Instrument_Serif } from "next/font/google";
import localFont from "next/font/local";
import type { WebApplication, WithContext } from "schema-dts";
import "../styles/globals.css";
import { PostHogPageview, PostHogProvider } from "@/providers/PostHogProvider";
import { env } from "@/env";
import { GlobalProviders } from "@/providers/GlobalProviders";
import { ScrollActivity } from "@/components/ScrollActivity";
import { UTM } from "@/app/utm";
import { startupImage } from "@/app/startup-image";
import { ThemedToaster } from "@/components/ThemedToaster";
import { BRAND_ICON_URL, BRAND_NAME, toAbsoluteUrl } from "@/utils/branding";

const aeonikFont = localFont({
  src: "../styles/aeonik-medium.woff",
  variable: "--font-title",
  preload: true,
  display: "swap",
});
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  weight: ["400", "500", "600", "700"], // font-normal, font-medium, font-semibold, font-bold
  display: "swap",
});
// Serif display face for page and folder headings
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-display",
  weight: "400",
  display: "swap",
});

const title = `${BRAND_NAME} | Automate and clean your inbox`;
const description =
  "Your AI executive assistant to reach inbox zero fast. Automate emails, bulk unsubscribe, block cold emails, and analytics. Open-source";

// JSON-LD structured data
const jsonLd: WithContext<WebApplication> = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: BRAND_NAME,
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
    name: BRAND_NAME,
    url: env.NEXT_PUBLIC_BASE_URL,
    logo: {
      "@type": "ImageObject",
      url: toAbsoluteUrl(BRAND_ICON_URL),
    },
    sameAs: ["https://github.com/cdagesse/Zerrow"],
  },
};

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: BRAND_NAME,
    type: "website",
    url: env.NEXT_PUBLIC_BASE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  metadataBase: new URL(env.NEXT_PUBLIC_BASE_URL),
  // issues with robots.txt: https://github.com/vercel/next.js/issues/58615#issuecomment-1852457285
  robots: {
    index: true,
    follow: true,
  },
  // pwa
  applicationName: BRAND_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: BRAND_NAME,
    startupImage,
  },
  formatDetection: {
    telephone: false,
  },
  // safe area for iOS PWA
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export const viewport = {
  themeColor: "#0A0E17",
  // Draw behind the status bar and home indicator so the installed app fills
  // the screen; env(safe-area-inset-*) only reports real values with this on
  viewportFit: "cover" as const,
  // The on-screen keyboard shrinks the viewport rather than sliding fixed
  // chrome (the bottom tray) out of reach
  interactiveWidget: "resizes-content" as const,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        className={`h-full ${env.NEXT_PUBLIC_USE_AEONIK_FONT ? aeonikFont.variable : ""} ${geist.variable} ${instrumentSerif.variable} font-sans antialiased`}
      >
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON.stringify on controlled object is safe
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd),
          }}
        />
        <PostHogProvider>
          <Suspense>
            <PostHogPageview />
          </Suspense>
          <GlobalProviders>
            <ScrollActivity />
            {children}
            <ThemedToaster closeButton richColors visibleToasts={9} />
          </GlobalProviders>
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
