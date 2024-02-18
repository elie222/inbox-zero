import React from "react";
// import { GmailProvider } from "@/providers/GmailProvider";
import { SessionProvider } from "@/providers/SessionProvider";
import { SWRProvider } from "@/providers/SWRProvider";
import { StatLoaderProvider } from "@/providers/StatLoaderProvider";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";

export default function Providers(props: { children: React.ReactNode }) {
  return (
    <SWRProvider>
      {/* <GmailProvider> */}
      <SessionProvider>
        <StatLoaderProvider>
          <ComposeModalProvider>{props.children}</ComposeModalProvider>
        </StatLoaderProvider>
      </SessionProvider>
      {/* </GmailProvider> */}
    </SWRProvider>
  );
}
