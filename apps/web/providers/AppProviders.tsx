import React from "react";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";

export function AppProviders(props: { children: React.ReactNode }) {
  return <ComposeModalProvider>{props.children}</ComposeModalProvider>;
}
