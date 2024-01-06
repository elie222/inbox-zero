import React from "react";
// import { GmailProvider } from "@/providers/GmailProvider";
import { SessionProvider } from "@/providers/SessionProvider";
import { SWRProvider } from "@/providers/SWRProvider";
import { StatLoaderProvider } from "@/providers/StatLoaderProvider";
import { QueueProvider } from "@/providers/QueueProvider";

export default function Providers(props: { children: React.ReactNode }) {
  return (
    <SWRProvider>
      {/* <GmailProvider> */}
      <SessionProvider>
        <StatLoaderProvider>
          <QueueProvider>{props.children}</QueueProvider>
        </StatLoaderProvider>
      </SessionProvider>
      {/* </GmailProvider> */}
    </SWRProvider>
  );
}
