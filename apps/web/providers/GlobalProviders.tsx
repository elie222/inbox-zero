import type React from "react";
import { SessionProvider } from "@/providers/SessionProvider";
import { SWRProvider } from "@/providers/SWRProvider";
import { StatLoaderProvider } from "@/providers/StatLoaderProvider";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";

export function GlobalProviders(props: { children: React.ReactNode }) {
  return (
    <SWRProvider>
      <SessionProvider>
        <StatLoaderProvider>
          <ComposeModalProvider>{props.children}</ComposeModalProvider>
        </StatLoaderProvider>
      </SessionProvider>
    </SWRProvider>
  );
}
