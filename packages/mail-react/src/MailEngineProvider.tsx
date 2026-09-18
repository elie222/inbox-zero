import { createContext, useContext, type ReactNode } from "react";
import type { MailClient } from "@inboxzero/mail-core/engine";

const MailEngineContext = createContext<MailClient | null>(null);

export function MailEngineProvider({
  client,
  children,
}: {
  client: MailClient;
  children: ReactNode;
}) {
  return (
    <MailEngineContext.Provider value={client}>
      {children}
    </MailEngineContext.Provider>
  );
}

export function useOptionalMailClient(): MailClient | null {
  return useContext(MailEngineContext);
}

export function useMailClient(): MailClient {
  const client = useOptionalMailClient();
  if (!client) {
    throw new Error("MailEngineProvider is required");
  }
  return client;
}
