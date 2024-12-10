"use client";

import type React from "react";
import { Provider } from "jotai";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";
import { jotaiStore } from "@/store";

export function AppProviders(props: { children: React.ReactNode }) {
  return (
    <Provider store={jotaiStore}>
      <NuqsAdapter>
        <ComposeModalProvider>{props.children}</ComposeModalProvider>
      </NuqsAdapter>
    </Provider>
  );
}
