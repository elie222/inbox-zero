"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { MailClient } from "@inboxzero/mail-core/engine";
import { MailEngineProvider } from "@inboxzero/mail-react/MailEngineProvider";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  createBrowserMailEngine,
  type BrowserMailEngine,
} from "@/utils/mail-engine/create-browser-engine";
import {
  createDesktopIpcMailClient,
  hasDesktopMailEngineIpc,
} from "@/utils/mail-engine/desktop-ipc";
import {
  selectMailEngineRuntimeMode,
  shouldStartMailEngine,
} from "@/utils/mail-engine/runtime-mode";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { fetchEmailAccounts } from "@/utils/fetch-email-accounts";
import { followMailboxChanges } from "@/utils/mail-engine/follow-mailbox-changes";
import { browserMailEngineCapabilities } from "@/utils/mail-engine/worker-protocol";
import { holdMailEngineOwner } from "@/utils/mail-engine/owner-lifetime";
import { atMailEngineStartupStage } from "@/utils/mail-engine/startup-stage";
import { bindMailEnginePageLifecycle } from "@/utils/mail-engine/page-lifecycle";
import { createClientLogger } from "@/utils/logger-client";
import { reportMailEngineStartupFailureAction } from "@/utils/actions/mail-engine";
import {
  MAIL_ENGINE_OWNER_LOCK,
  MAIL_ENGINE_TAB_CHANNEL,
  bindTabMailOwner,
  createBroadcastTabBus,
  createTabFollowerClient,
  disposeTabFollowerClient,
} from "@/utils/mail-engine/tab-channel";
import {
  setActiveMailClient,
  subscribeMailEngineLogout,
} from "@/utils/mail-engine/active-client";

type MailEngineRuntimeStatus = {
  client: MailClient | null;
  mounted: boolean;
  startupError: boolean;
  retry: () => void;
  requestBrowserEngine: () => void;
};

type MailEngineInspectTransport = "browser" | "desktop-ipc";

const MailEngineRuntimeStatusContext = createContext<MailEngineRuntimeStatus>({
  client: null,
  mounted: false,
  startupError: false,
  retry: () => {},
  requestBrowserEngine: () => {},
});

export function useMailEngineDemand() {
  const { requestBrowserEngine } = useContext(MailEngineRuntimeStatusContext);
  useEffect(requestBrowserEngine, [requestBrowserEngine]);
}

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
  const status = useContext(MailEngineRuntimeStatusContext);
  // SSR has no OPFS; checking capabilities before hydration paints the
  // storage-error shell instead of the shared loading state.
  const isClient = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  if (!isClient) {
    return <LoadingContent loading>{null}</LoadingContent>;
  }
  const mode = selectMailEngineRuntimeMode({
    desktopIpc: hasDesktopMailEngineIpc(),
    opfs: browserMailEngineCapabilities().opfs,
  });
  if (mode === "unavailable") {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground text-sm">
        Mail needs persistent browser storage.
      </div>
    );
  }
  if (status.startupError) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-muted-foreground text-sm"
        role="alert"
      >
        <p>Mail could not start. Please try again.</p>
        <Button variant="outline" onClick={status.retry}>
          Retry
        </Button>
      </div>
    );
  }
  if (!status.client) {
    return <LoadingContent loading>{null}</LoadingContent>;
  }
  return children;
}

function MailEngineRuntimeInner({ children }: { children: ReactNode }) {
  const { emailAccountId, provider, isLoading } = useAccount();
  const pathname = usePathname();
  const desktopIpc = useSyncExternalStore(
    subscribeNever,
    hasDesktopMailEngineIpc,
    () => false,
  );
  const [browserRequested, setBrowserRequested] = useState(false);
  const requestBrowserEngine = useCallback(() => setBrowserRequested(true), []);
  const enabled = shouldStartMailEngine({
    pathname,
    desktopIpc,
    browserRequested,
    accountReady: !isLoading && !!provider,
  });
  const [client, setClient] = useState<MailClient | null>(null);
  const [startupError, setStartupError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!emailAccountId || !enabled) {
      setStartupError(false);
      return;
    }
    // Keep queued sends and undo working after the initiating page or composer closes.
    if (!desktopIpc) requestBrowserEngine();
    setStartupError(false);
    const mode = selectMailEngineRuntimeMode({
      desktopIpc,
      opfs: browserMailEngineCapabilities().opfs,
    });
    if (mode === "unavailable") {
      return;
    }
    const mailProvider =
      provider === "icloud"
        ? "icloud"
        : isMicrosoftProvider(provider)
          ? "microsoft"
          : "google";
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
        provider: mailProvider,
      });
      publishClient(client, "owner", "desktop-ipc").catch(() => {
        if (!abort.signal.aborted) setStartupError(true);
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

    let engine: BrowserMailEngine | undefined;
    const unbindPageLifecycle = bindMailEnginePageLifecycle(
      window,
      abort,
      retry,
    );
    let unbindOwner: (() => void) | undefined;
    let unbindHello: (() => void) | undefined;
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(MAIL_ENGINE_TAB_CHANNEL)
        : null;
    const bus = channel ? createBroadcastTabBus(channel) : null;

    if (bus) {
      unbindHello = bus.subscribe((message) => {
        if (message.type === "ready" && !engine && !published) {
          bus.post({
            type: "hello",
            accountId: emailAccountId,
            provider: mailProvider,
          });
          return;
        }
        if (
          message.type !== "owner" ||
          message.accountId !== emailAccountId ||
          engine ||
          published
        ) {
          return;
        }
        publishClient(
          createTabFollowerClient({
            accountId: emailAccountId,
            provider: mailProvider,
            bus,
          }),
          "follower",
          "browser",
        ).catch(() => undefined);
      });
      bus.post({
        type: "hello",
        accountId: emailAccountId,
        provider: mailProvider,
      });
    }

    async function start() {
      const create = async () => {
        engine = await atMailEngineStartupStage("browser-engine", () =>
          createBrowserMailEngine(
            {
              accountId: emailAccountId,
              provider: mailProvider,
              online: typeof navigator === "undefined" || navigator.onLine,
            },
            abort.signal,
          ),
        );
        if (!abort.signal.aborted && bus) {
          unbindOwner = bindTabMailOwner({
            client: engine,
            bus,
            ensureAccount: engine.ensureAccount,
          });
          bus.post({ type: "ready" });
          bus.post({ type: "owner", accountId: emailAccountId });
        }
        await publishClient(engine, "owner", "browser");
        const ownedEngine = engine;
        return async () => {
          unbindOwner?.();
          await ownedEngine.close();
        };
      };
      if (typeof navigator !== "undefined" && navigator.locks?.request) {
        await atMailEngineStartupStage("owner-lock", () =>
          navigator.locks.request(
            MAIL_ENGINE_OWNER_LOCK,
            { signal: abort.signal },
            () => holdMailEngineOwner(abort.signal, create),
          ),
        );
        return;
      }
      await holdMailEngineOwner(abort.signal, create);
    }

    start().catch((error) => {
      if (!abort.signal.aborted) {
        createClientLogger("mail-engine").error("Mail engine startup failed", {
          error,
          attempt,
        });
        reportMailEngineStartupFailureAction
          .bind(
            null,
            emailAccountId,
          )({
            errorName:
              error instanceof Error ? error.name.slice(0, 100) : "Error",
            errorMessage:
              error instanceof Error
                ? error.message.slice(0, 1000)
                : "Unknown startup failure",
          })
          .catch(() => undefined);
        setStartupError(true);
      }
    });

    const unsubscribeLogout = subscribeMailEngineLogout(() => {
      abort.abort();
    });

    return () => {
      unbindPageLifecycle();
      unsubscribeLogout();
      abort.abort();
      unbindOwner?.();
      unbindHello?.();
      if (published) disposeTabFollowerClient(published);
      clearMailEngineInspect();
      setActiveMailClient(null);
      channel?.close();
      setClient(null);
    };
  }, [
    emailAccountId,
    provider,
    enabled,
    desktopIpc,
    requestBrowserEngine,
    retry,
    attempt,
  ]);

  useEffect(() => {
    if (!client || !emailAccountId) return;
    let cancelled = false;
    // Accounts deleted on another device stay in this device's local store
    // and keep syncing until the server's list says they are gone. The open
    // account stays too, since an org admin may be viewing a member's mail.
    fetchEmailAccounts()
      .then(({ emailAccounts }) => {
        if (cancelled || emailAccounts.length === 0) return;
        return client.retainAccounts([
          emailAccountId,
          ...emailAccounts.map((account) => account.id),
        ]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, emailAccountId]);

  useEffect(() => {
    // The desktop engine follows mailbox changes itself.
    if (!client || !emailAccountId || hasDesktopMailEngineIpc()) return;
    return followMailboxChanges({
      accountId: emailAccountId,
      onChange: () => {
        client.requestSync([emailAccountId]).catch(() => undefined);
      },
    });
  }, [client, emailAccountId]);

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
      value={{
        client,
        mounted: true,
        startupError,
        retry,
        requestBrowserEngine,
      }}
    >
      <MailEngineProvider client={client}>{children}</MailEngineProvider>
    </MailEngineRuntimeStatusContext.Provider>
  );
}

function publishMailEngineInspect(
  client: MailClient,
  accountId: string,
  role: "owner" | "follower",
  transport: MailEngineInspectTransport,
) {
  if (!canExposeMailEngineInspect()) return;
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

function canExposeMailEngineInspect() {
  return (
    typeof window !== "undefined" &&
    (process.env.NODE_ENV !== "production" ||
      env.NEXT_PUBLIC_MAIL_ENGINE_TEST_INSPECT)
  );
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
