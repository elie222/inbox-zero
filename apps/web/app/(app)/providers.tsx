import React from "react";
// import { GmailProvider } from "@/providers/GmailProvider";
import { SessionProvider } from "@/providers/SessionProvider";
import { SWRProvider } from "@/providers/SWRProvider";
import { StatLoaderProvider } from "@/providers/StatLoaderProvider";

export default function Providers(props: { children: React.ReactNode }) {
  return (
    <SWRProvider>
      {/* <GmailProvider> */}
      <SessionProvider>
        <StatLoaderProvider>{props.children}</StatLoaderProvider>
      </SessionProvider>
      {/* </GmailProvider> */}
    </SWRProvider>
  );
}
