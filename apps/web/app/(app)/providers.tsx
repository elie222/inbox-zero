import React from "react";
// import { GmailProvider } from "@/providers/GmailProvider";
import { SessionProvider } from "@/providers/SessionProvider";
import { SWRProvider } from "@/providers/SWRProvider";

export default function Providers(props: { children: React.ReactNode }) {
  return (
    <SWRProvider>
      {/* <GmailProvider> */}
      <SessionProvider>{props.children}</SessionProvider>
      {/* </GmailProvider> */}
    </SWRProvider>
  );
}
