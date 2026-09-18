"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { MailClient } from "@inboxzero/mail-core/engine";
import { MailEngineProvider } from "@inboxzero/mail-react/MailEngineProvider";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createBrowserMailEngine } from "@/utils/mail-engine/create-browser-engine";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { browserMailEngineCapabilities } from "@/utils/mail-engine/worker-protocol";
import {
  MAIL_ENGINE_OWNER_LOCK,
  MAIL_ENGINE_TAB_CHANNEL,
  bindTabMailOwner,
  createBroadcastTabBus,
  createTabFollowerClient,
} from "@/utils/mail-engine/tab-channel";

export function MailEngineHost({ children }: { children: ReactNode }) {
  const { emailAccountId, provider } = useAccount();
  const [client, setClient] = useState<MailClient | null>(null);

  useEffect(() => {
    if (!emailAccountId) return;
    const capabilities = browserMailEngineCapabilities();
    if (!capabilities.opfs) return;
    let engine: Awaited<ReturnType<typeof createBrowserMailEngine>> | undefined;
    let unbindOwner: (() => void) | undefined;
    const abort = new AbortController();
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(MAIL_ENGINE_TAB_CHANNEL)
        : null;
    const bus = channel ? createBroadcastTabBus(channel) : null;
    if (bus) {
      setClient(createTabFollowerClient({ accountId: emailAccountId, bus }));
      bus.post({ type: "hello", accountId: emailAccountId });
    }

    async function hold(create: () => Promise<void>) {
      await create();
      await new Promise<void>((resolve) => {
        if (abort.signal.aborted) {
          resolve();
          return;
        }
        abort.signal.addEventListener("abort", () => resolve(), { once: true });
      });
    }

    async function start() {
      const create = async () => {
        engine = await createBrowserMailEngine({
          accountId: emailAccountId,
          provider: isMicrosoftProvider(provider) ? "microsoft" : "google",
        });
        if (abort.signal.aborted) {
          await engine.close();
          return;
        }
        if (bus) {
          unbindOwner = bindTabMailOwner({
            accountId: emailAccountId,
            client: engine,
            bus,
          });
          bus.post({ type: "owner", accountId: emailAccountId });
        }
        setClient(engine);
      };
      if (typeof navigator !== "undefined" && navigator.locks?.request) {
        await navigator.locks.request(
          MAIL_ENGINE_OWNER_LOCK,
          { signal: abort.signal },
          () => hold(create),
        );
        return;
      }
      await hold(create);
    }

    start().catch(() => setClient(null));

    return () => {
      abort.abort();
      unbindOwner?.();
      channel?.close();
      engine?.close().catch(() => undefined);
      setClient(null);
    };
  }, [emailAccountId, provider]);

  if (!client) return children;
  return <MailEngineProvider client={client}>{children}</MailEngineProvider>;
}
