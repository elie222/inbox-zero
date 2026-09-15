"use client";

import type React from "react";
import { Provider } from "jotai";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";
import { jotaiStore } from "@/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ChatProvider } from "@/providers/ChatProvider";
import { EmailAccountProvider } from "@/providers/EmailAccountProvider";
import { StatLoaderProvider } from "@/providers/StatLoaderProvider";
import { SWRProvider } from "@/providers/SWRProvider";

export function AppProviders(props: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      disableTransitionOnChange
    >
      {/* One provider so adjacent tooltips skip the open delay after the first. */}
      <TooltipProvider delayDuration={200} skipDelayDuration={300}>
        <Provider store={jotaiStore}>
          <EmailAccountProvider>
            <SWRProvider>
              <StatLoaderProvider>
                <ChatProvider>
                  <ComposeModalProvider>{props.children}</ComposeModalProvider>
                </ChatProvider>
              </StatLoaderProvider>
            </SWRProvider>
          </EmailAccountProvider>
        </Provider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
