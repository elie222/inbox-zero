"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { MailClient } from "@inboxzero/mail-core/engine";
import { MailEngineProvider } from "@inboxzero/mail-react/MailEngineProvider";
import { LoadingContent } from "@/components/LoadingContent";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createBrowserMailEngine } from "@/utils/mail-engine/create-browser-engine";
import {
  createDesktopIpcMailClient,
  hasDesktopMailEngineIpc,
} from "@/utils/mail-engine/desktop-ipc";
import { selectMailEngineRuntimeMode } from "@/utils/mail-engine/runtime-mode";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { browserMailEngineCapabilities } from "@/utils/mail-engine/worker-protocol";
import {
  MAIL_ENGINE_OWNER_LOCK,
  MAIL_ENGINE_TAB_CHANNEL,
  bindTabMailOwner,
  createBroadcastTabBus,
  createTabFollowerClient,
  disposeTabFollowerClient,
} from "@/utils/mail-engine/tab-channel";
import { waitForMetadataCoverage } from "@/utils/mail-engine/coverage";
import {
  setActiveMailClient,
  subscribeMailEngineLogout,
} from "@/utils/mail-engine/active-client";
import { MailEngineConnectionBanner } from "@/utils/mail-engine/MailEngineConnectionBanner";

type MailEngineRuntimeStatus = {
  client: MailClient | null;
  mounted: boolean;
  unavailable: boolean;
};

type MailEngineInspectTransport = "browser" | "desktop-ipc";

const MailEngineRuntimeStatusContext = createContext<MailEngineRuntimeStatus>({
  client: null,
  mounted: false,
  unavailable: false,
});

export function MailEngineRuntime({ children }: { children: ReactNode }) {
  const status = useContext(MailEngineRuntimeStatusContext);
  if (status.mounted) return children;
  return <MailEngineRuntimeInner>{children}</MailEngineRuntimeInner>;
}

export function MailEngineHost({ children }: { children: ReactNode }) {
  return (
    <MailEngineRuntime>
      <MailCoverageGate>{children}</MailCoverageGate>
    </MailEngineRuntime>
  );
}

export function MailCoverageGate({ children }: { children: ReactNode }) {
  const { emailAccountId } = useAccount();
  const status = useContext(MailEngineRuntimeStatusContext);
  const [ready, setReady] = useState(false);
  // SSR has no OPFS; checking capabilities before hydration paints the
  // storage-error shell instead of the shared loading state.
  const isClient = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  useEffect(() => {
    setReady(false);
    if (!status.client || !emailAccountId) return;
    const abort = new AbortController();
    waitForMetadataCoverage(status.client, emailAccountId, abort.signal).then(
      (complete) => {
        if (complete) setReady(true);
      },
    );
    return () => abort.abort();
  }, [emailAccountId, status.client]);

  if (!isClient) {
    return <LoadingContent loading>{null}</LoadingContent>;
  }
  const mode = selectMailEngineRuntimeMode({
    desktopIpc: hasDesktopMailEngineIpc(),
    opfs: browserMailEngineCapabilities().opfs,
  });
  if (status.unavailable || mode === "unavailable") {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground text-sm">
        Mail needs persistent browser storage.
      </div>
    );
  }
  if (!status.client || !ready) {
    return <LoadingContent loading>{null}</LoadingContent>;
  }
  return children;
}

function MailEngineRuntimeInner({ children }: { children: ReactNode }) {
  const { emailAccountId, provider } = useAccount();
  const [client, setClient] = useState<MailClient | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!emailAccountId) return;
    const mode = selectMailEngineRuntimeMode({
      desktopIpc: hasDesktopMailEngineIpc(),
      opfs: browserMailEngineCapabilities().opfs,
    });
    if (mode === "unavailable") {
      setUnavailable(true);
      return;
    }
    const abort = new AbortController();
    let published: MailClient | undefined;

    async function publishClient(
      next: MailClient,
      role: "owner" | "follower",
      transport: MailEngineInspectTransport,
    ) {
      if (abort.signal.aborted) return;
      if (published && published !== next) disposeTabFollowerClient(published);
      published = next;
      publishMailEngineInspect(next, emailAccountId, role, transport);
      setActiveMailClient(next);
      setClient(next);
    }

    if (mode === "desktop-ipc") {
      const client = createDesktopIpcMailClient({
        provider: isMicrosoftProvider(provider) ? "microsoft" : "google",
      });
      publishClient(client, "owner", "desktop-ipc").catch(() => {
        if (!abort.signal.aborted) setUnavailable(true);
      });
      client.requestSync([emailAccountId]).catch(() => undefined);
      const unsubscribeLogout = subscribeMailEngineLogout(() => abort.abort());
      return () => {
        unsubscribeLogout();
        abort.abort();
        if (published) disposeTabFollowerClient(published);
        clearMailEngineInspect();
        setActiveMailClient(null);
        setClient(null);
      };
    }

    let engine: Awaited<ReturnType<typeof createBrowserMailEngine>> | undefined;
    let unbindOwner: (() => void) | undefined;
    let unbindHello: (() => void) | undefined;
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(MAIL_ENGINE_TAB_CHANNEL)
        : null;
    const bus = channel ? createBroadcastTabBus(channel) : null;

    if (bus) {
      unbindHello = bus.subscribe((message) => {
        if (
          message.type !== "owner" ||
          message.accountId !== emailAccountId ||
          engine ||
          published
        ) {
          return;
        }
        publishClient(
          createTabFollowerClient({ accountId: emailAccountId, bus }),
          "follower",
          "browser",
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
        await publishClient(engine, "owner", "browser");
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

    const unsubscribeLogout = subscribeMailEngineLogout(() => {
      abort.abort();
      engine?.close().catch(() => undefined);
    });

    return () => {
      unsubscribeLogout();
      abort.abort();
      unbindOwner?.();
      unbindHello?.();
      if (published) disposeTabFollowerClient(published);
      clearMailEngineInspect();
      setActiveMailClient(null);
      channel?.close();
      engine?.close().catch(() => undefined);
      setClient(null);
    };
  }, [emailAccountId, provider]);

  useEffect(() => {
    if (!client || !emailAccountId) return;
    const resumeDeferred = () => {
      if (!navigator.onLine) return;
      client.requestSync([emailAccountId]).catch(() => undefined);
    };
    window.addEventListener("online", resumeDeferred);
    return () => window.removeEventListener("online", resumeDeferred);
  }, [client, emailAccountId]);

  return (
    <MailEngineRuntimeStatusContext.Provider
      value={{ client, mounted: true, unavailable }}
    >
      {client ? (
        <MailEngineProvider client={client}>
          <MailEngineConnectionBanner />
          {children}
        </MailEngineProvider>
      ) : (
        children
      )}
    </MailEngineRuntimeStatusContext.Provider>
  );
}

function publishMailEngineInspect(
  client: MailClient,
  accountId: string,
  role: "owner" | "follower",
  transport: MailEngineInspectTransport,
) {
  if (typeof window === "undefined") return;
  window.__inboxZeroMailInspect = {
    accountId,
    role,
    transport,
    capabilities: browserMailEngineCapabilities(),
    read: () => client.getDiagnostics(accountId),
    requestSync: () => client.requestSync([accountId]),
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

function subscribeNever() {
  return () => undefined;
}

declare global {
  interface Window {
    __inboxZeroMailInspect?: {
      accountId: string;
      role: "owner" | "follower";
      transport: MailEngineInspectTransport;
      capabilities: ReturnType<typeof browserMailEngineCapabilities>;
      read: () => Promise<unknown>;
      requestSync: () => Promise<unknown>;
      inspect: () => Promise<unknown>;
    };
  }
}
