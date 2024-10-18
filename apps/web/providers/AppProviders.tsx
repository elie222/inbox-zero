"use client";

import type React from "react";
import { Provider } from "jotai";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";
import { jotaiStore } from "@/store";

export function AppProviders(props: { children: React.ReactNode }) {
  return (
    <Provider store={jotaiStore}>
      <ComposeModalProvider>{props.children}</ComposeModalProvider>
    </Provider>
  );
}
