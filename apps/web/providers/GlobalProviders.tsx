import type React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SessionProvider } from "@/providers/SessionProvider";
import { SWRProvider } from "@/providers/SWRProvider";
import { StatLoaderProvider } from "@/providers/StatLoaderProvider";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";

export function GlobalProviders(props: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <SWRProvider>
        <SessionProvider>
          <StatLoaderProvider>
            <ComposeModalProvider>{props.children}</ComposeModalProvider>
          </StatLoaderProvider>
        </SessionProvider>
      </SWRProvider>
    </NuqsAdapter>
  );
}
