import React from "react";
import { SessionProvider } from "@/providers/SessionProvider";
import { SWRProvider } from "@/providers/SWRProvider";
import { StatLoaderProvider } from "@/providers/StatLoaderProvider";

export function GlobalProviders(props: { children: React.ReactNode }) {
  return (
    <SWRProvider>
      <SessionProvider>
        <StatLoaderProvider>{props.children}</StatLoaderProvider>
      </SessionProvider>
    </SWRProvider>
  );
}
