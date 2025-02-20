"use client";

import type React from "react";
import { Provider } from "jotai";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";
import { jotaiStore } from "@/store";
import { ThemeProvider } from "@/components/theme-provider";

export function AppProviders(props: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" enableSystem>
      <Provider store={jotaiStore}>
        <NuqsAdapter>
          <ComposeModalProvider>{props.children}</ComposeModalProvider>
        </NuqsAdapter>
      </Provider>
    </ThemeProvider>
  );
}
