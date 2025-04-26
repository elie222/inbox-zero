import type React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SessionProvider } from "@/providers/SessionProvider";
import { SWRProvider } from "@/providers/SWRProvider";
import { StatLoaderProvider } from "@/providers/StatLoaderProvider";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";
import { EmailAccountProvider } from "@/providers/EmailAccountProvider";

export function GlobalProviders(props: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <EmailAccountProvider>
        <SWRProvider>
          <SessionProvider>
            <StatLoaderProvider>
              <ComposeModalProvider>{props.children}</ComposeModalProvider>
            </StatLoaderProvider>
          </SessionProvider>
        </SWRProvider>
      </EmailAccountProvider>
    </NuqsAdapter>
  );
}
