"use client";

import type React from "react";
import { Provider } from "jotai";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";
import { jotaiStore } from "@/store";
import { ThemeProvider } from "@/components/theme-provider";
import { ChatProvider } from "@/providers/ChatProvider";

export function AppProviders(props: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <Provider store={jotaiStore}>
        <ChatProvider>
          <ComposeModalProvider>{props.children}</ComposeModalProvider>
        </ChatProvider>
      </Provider>
    </ThemeProvider>
  );
}
