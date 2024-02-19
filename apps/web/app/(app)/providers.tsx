import React from "react";
import { Provider } from "jotai";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";

export function AppProviders(props: { children: React.ReactNode }) {
  return (
    <Provider>
      <ComposeModalProvider>{props.children}</ComposeModalProvider>
    </Provider>
  );
}
