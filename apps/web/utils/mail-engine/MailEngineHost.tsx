"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { MailClient } from "@inboxzero/mail-core/engine";
import { MailEngineProvider } from "@inboxzero/mail-react/MailEngineProvider";
import { LoadingContent } from "@/components/LoadingContent";
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
import { waitForMetadataCoverage } from "@/utils/mail-engine/coverage";

export function MailEngineHost({ children }: { children: ReactNode }) {
  const { emailAccountId, provider } = useAccount();
  const [client, setClient] = useState<MailClient | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!emailAccountId) return;
    const capabilities = browserMailEngineCapabilities();
    if (!capabilities.opfs) {
      setUnavailable(true);
      return;
    }
    let engine: Awaited<ReturnType<typeof createBrowserMailEngine>> | undefined;
    let unbindOwner: (() => void) | undefined;
    let unbindHello: (() => void) | undefined;
    const abort = new AbortController();
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(MAIL_ENGINE_TAB_CHANNEL)
        : null;
    const bus = channel ? createBroadcastTabBus(channel) : null;

    async function publishClient(next: MailClient) {
      const ready = await waitForMetadataCoverage(
        next,
        emailAccountId,
        abort.signal,
      );
      if (!ready || abort.signal.aborted) return;
      publishMailEngineInspect(next, emailAccountId);
      setClient(next);
    }

    if (bus) {
      unbindHello = bus.subscribe((message) => {
        if (message.type !== "owner" || message.accountId !== emailAccountId) {
          return;
        }
        publishClient(
          createTabFollowerClient({ accountId: emailAccountId, bus }),
        ).catch(() => undefined);
      });
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
        await publishClient(engine);
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

    start().catch(() => {
      if (!abort.signal.aborted) setUnavailable(true);
    });

    return () => {
      abort.abort();
      unbindOwner?.();
      unbindHello?.();
      clearMailEngineInspect();
      channel?.close();
      engine?.close().catch(() => undefined);
      setClient(null);
    };
  }, [emailAccountId, provider]);

  if (unavailable) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground text-sm">
        Mail needs persistent browser storage.
      </div>
    );
  }
  if (!client) {
    return <LoadingContent loading>{null}</LoadingContent>;
  }
  return <MailEngineProvider client={client}>{children}</MailEngineProvider>;
}

function publishMailEngineInspect(client: MailClient, accountId: string) {
  if (typeof window === "undefined") return;
  window.__inboxZeroMailInspect = {
    accountId,
    read: () => client.getDiagnostics(accountId),
    inspect: () =>
      "inspect" in client && typeof client.inspect === "function"
        ? (
            client as MailClient & {
              inspect: () => Promise<unknown>;
            }
          ).inspect()
        : Promise.resolve(null),
  };
}

function clearMailEngineInspect() {
  if (typeof window === "undefined") return;
  window.__inboxZeroMailInspect = undefined;
}

declare global {
  interface Window {
    __inboxZeroMailInspect?: {
      accountId: string;
      read: () => Promise<unknown>;
      inspect: () => Promise<unknown>;
    };
  }
}
