import React from "react";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";
import { Provider } from "jotai";

export function AppProviders(props: { children: React.ReactNode }) {
  return (
    <Provider>
      <ComposeModalProvider>{props.children}</ComposeModalProvider>
    </Provider>
  );
}
