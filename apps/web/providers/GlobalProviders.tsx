import type React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SerwistProvider } from "@serwist/next/react";
import { SWRProvider } from "@/providers/SWRProvider";
import { StatLoaderProvider } from "@/providers/StatLoaderProvider";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";
import { EmailAccountProvider } from "@/providers/EmailAccountProvider";

export function GlobalProviders(props: { children: React.ReactNode }) {
  return (
    // Registers the service worker built by `serwist build`; the @serwist/next
    // webpack plugin used to inject this registration, but it doesn't support
    // Turbopack. cacheOnNavigation={false} matches the old plugin default.
    <SerwistProvider
      swUrl="/sw.js"
      cacheOnNavigation={false}
      disable={process.env.NODE_ENV !== "production"}
    >
      <NuqsAdapter>
        <EmailAccountProvider>
          <SWRProvider>
            <StatLoaderProvider>
              <ComposeModalProvider>{props.children}</ComposeModalProvider>
            </StatLoaderProvider>
          </SWRProvider>
        </EmailAccountProvider>
      </NuqsAdapter>
    </SerwistProvider>
  );
}
