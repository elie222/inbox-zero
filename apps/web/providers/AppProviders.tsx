"use client";

import type React from "react";
import { Provider } from "jotai";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";
import { jotaiStore } from "@/store";
import { ThemeProvider } from "@/components/theme-provider";
import { ChatProvider } from "@/providers/ChatProvider";
import { EmailAccountProvider } from "@/providers/EmailAccountProvider";
import { StatLoaderProvider } from "@/providers/StatLoaderProvider";
import { SWRProvider } from "@/providers/SWRProvider";
import { MailEngineRuntime } from "@/utils/mail-engine/MailEngineHost";

export function AppProviders(props: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <Provider store={jotaiStore}>
        <EmailAccountProvider>
          <SWRProvider>
            <StatLoaderProvider>
              <ChatProvider>
                <MailEngineRuntime>
                  <ComposeModalProvider>{props.children}</ComposeModalProvider>
                </MailEngineRuntime>
              </ChatProvider>
            </StatLoaderProvider>
          </SWRProvider>
        </EmailAccountProvider>
      </Provider>
    </ThemeProvider>
  );
}
