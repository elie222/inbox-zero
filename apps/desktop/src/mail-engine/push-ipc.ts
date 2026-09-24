import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";

type PushOwner = {
  subscribe(
    payload: unknown,
    onSnapshot: (snapshot: unknown) => void,
  ): (() => void) | null;
};

/**
 * Lets a window subscribe to engine observations and receive each changed
 * snapshot, instead of polling every query on a timer.
 */
export function registerMailEnginePushIpc(input: {
  ipcMain: Pick<IpcMain, "handle">;
  getOwner: () => Promise<PushOwner | undefined> | PushOwner | undefined;
  isTrusted?: (event: IpcMainInvokeEvent) => boolean;
}) {
  const subscriptionsByContents = new WeakMap<
    WebContents,
    Map<string, () => void>
  >();

  function subscriptionsFor(contents: WebContents) {
    const existing = subscriptionsByContents.get(contents);
    if (existing) return existing;
    const created = new Map<string, () => void>();
    subscriptionsByContents.set(contents, created);
    const close = (ids: Iterable<string>) => {
      for (const id of [...ids]) {
        created.get(id)?.();
        created.delete(id);
      }
    };
    // A navigation can be blocked after it starts, so the old page's
    // subscriptions close only once it commits, and the new page's survive.
    let leaving: string[] | null = null;
    contents.once("destroyed", () => close(created.keys()));
    contents.on("did-start-navigation", ({ isMainFrame, isSameDocument }) => {
      if (isMainFrame && !isSameDocument) leaving = [...created.keys()];
    });
    contents.on("did-navigate", () => {
      close(leaving ?? []);
      leaving = null;
    });
    return created;
  }

  input.ipcMain.handle("mail-engine-subscribe", async (event, raw: unknown) => {
    if (input.isTrusted && !input.isTrusted(event)) {
      return { status: "invalid" };
    }
    const subscription = parseSubscription(raw);
    if (!subscription) return { status: "invalid" };
    const contents = event.sender;
    const { subscriptionId } = subscription;
    // Registered before awaiting the owner so an early unsubscribe wins.
    const active = subscriptionsFor(contents);
    active.set(subscriptionId, () => {});
    const owner = await input.getOwner();
    const unsubscribe = owner?.subscribe(subscription.request, (snapshot) => {
      if (contents.isDestroyed()) return;
      contents.send("mail-engine-snapshot", { subscriptionId, snapshot });
    });
    if (!unsubscribe) {
      active.delete(subscriptionId);
      return { status: "invalid" };
    }
    if (!active.has(subscriptionId)) {
      unsubscribe();
      return { status: "ok" };
    }
    active.set(subscriptionId, unsubscribe);
    return { status: "ok" };
  });

  input.ipcMain.handle(
    "mail-engine-unsubscribe",
    (event, subscriptionId: unknown) => {
      if (input.isTrusted && !input.isTrusted(event)) {
        return { status: "invalid" };
      }
      if (typeof subscriptionId !== "string") return { status: "invalid" };
      const active = subscriptionsByContents.get(event.sender);
      active?.get(subscriptionId)?.();
      active?.delete(subscriptionId);
      return { status: "ok" };
    },
  );
}

function parseSubscription(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const { subscriptionId, request } = raw as {
    subscriptionId?: unknown;
    request?: unknown;
  };
  if (typeof subscriptionId !== "string" || !subscriptionId) return null;
  return { subscriptionId, request };
}
