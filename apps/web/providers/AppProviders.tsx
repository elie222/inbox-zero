import type React from "react";
import { Provider } from "jotai";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";
import { QueueProvider } from "@/providers/QueueProvider";
import { jotaiStore } from "@/store";

export function AppProviders(props: { children: React.ReactNode }) {
  return (
    <Provider store={jotaiStore}>
      <QueueProvider>
        <ComposeModalProvider>{props.children}</ComposeModalProvider>
      </QueueProvider>
    </Provider>
  );
}
