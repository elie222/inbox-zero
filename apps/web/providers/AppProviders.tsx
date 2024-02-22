import React from "react";
import { Provider } from "jotai";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";
import { QueueProvider } from "@/providers/QueueProvider";

export function AppProviders(props: { children: React.ReactNode }) {
  return (
    <Provider>
      <QueueProvider>
        <ComposeModalProvider>{props.children}</ComposeModalProvider>
      </QueueProvider>
    </Provider>
  );
}
