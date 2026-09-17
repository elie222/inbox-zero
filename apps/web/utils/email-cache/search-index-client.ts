import { readLocalMailSettings } from "./local-mail-settings";
import { getEmailCacheDatabase } from "./database";
import { isMailSyncActivated } from "./mail-activation";
import { randomUuid } from "@/utils/uuid";
import type {
  SearchIndexRequest,
  SearchIndexResponse,
} from "./search-index.worker";

type Scope = { emailAccountId: string; generation: string };
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
type AccountCommand = WithoutId<
  Exclude<
    SearchIndexRequest,
    { command: "deleteAccount" | "accounts" | "storage" | "clearAll" }
  >
>;
type Result =
  | WithoutId<SearchIndexResponse>
  | { error: "unsupported" | "stale" | "timeout" | "closed" };
type Operation =
  | { kind: "account"; scope: Scope; command: AccountCommand }
  | { kind: "delete"; scope: Scope }
  | { kind: "clear" }
  | { kind: "reconcile" };
type Envelope =
  | { kind: "owner"; sender: string }
  | { kind: "request"; sender: string; id: string; operation: Operation }
  | { kind: "response"; recipient: string; id: string; response: Result };
type Pending = {
  operation: Operation;
  resolve: (result: Result) => void;
  timer: ReturnType<typeof setTimeout>;
};
const LOCK = "inbox-zero:mail-search-owner";
const CHANNEL = "inbox-zero:mail-search-rpc";
const MAX_PENDING = 16;

/** Creating a client does not open storage, channels, locks, or workers. */
export function createSearchIndexClient() {
  const clientId = randomUuid();
  const pending = new Map<string, Pending>();
  const ownerJobs = new Set<string>();
  const completed = new Map<string, Result>();
  let channel: BroadcastChannel | undefined;
  let worker: Worker | undefined;
  let activeWorker:
    | {
        id: number;
        resolve: (response: SearchIndexResponse) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  let workerSequence = 0;
  let reconciled = false;
  let admitted = 0;
  let closed = false;
  let owner = false;
  let attemptingOwnership = false;
  let releaseOwnership: (() => void) | undefined;
  let probeTimer: ReturnType<typeof setInterval> | undefined;
  let jobs = Promise.resolve();
  let transportEpoch = 0;

  async function authorized(operation: Operation) {
    const database = await getEmailCacheDatabase();
    if (!database) return false;
    if (operation.kind === "reconcile") return true;
    if (operation.kind === "clear")
      return (await database.count("searchIndexAccounts")) === 0;
    const account = await database.get(
      "searchIndexAccounts",
      operation.scope.emailAccountId,
    );
    if (operation.kind === "delete")
      return account?.generation !== operation.scope.generation;
    if (
      !isMailSyncActivated(operation.scope.emailAccountId) ||
      account?.generation !== operation.scope.generation
    )
      return false;
    const command = operation.command;
    if ("request" in command) {
      if (
        command.request.emailAccountId !== operation.scope.emailAccountId ||
        command.request.generation !== operation.scope.generation
      )
        return false;
    } else if (command.emailAccountId !== operation.scope.emailAccountId)
      return false;
    return true;
  }

  function stopWorker() {
    worker?.terminate();
    worker = undefined;
    reconciled = false;
    if (activeWorker) {
      clearTimeout(activeWorker.timer);
      activeWorker.resolve({ id: activeWorker.id, error: "unavailable" });
      activeWorker = undefined;
    }
  }

  async function reconcileAccounts() {
    if (reconciled) return;
    const database = await getEmailCacheDatabase();
    if (!database) throw new Error("Local source unavailable");
    let after: string | undefined;
    do {
      const response = await workerRequest({ command: "accounts", after });
      if (
        !("result" in response) ||
        !response.result ||
        typeof response.result !== "object" ||
        !("accounts" in response.result)
      )
        throw new Error("Index account reconciliation failed");
      for (const account of response.result.accounts) {
        const source = await database.get(
          "searchIndexAccounts",
          account.emailAccountId,
        );
        if (source?.generation !== account.generation) {
          const removed = await workerRequest({
            command: "deleteAccount",
            request: {
              emailAccountId: account.emailAccountId,
              generation: account.generation,
            },
          });
          if (!("result" in removed) || !removed.result)
            throw new Error("Index account cleanup failed");
        }
      }
      after = response.result.nextCursor;
    } while (after);
    reconciled = true;
  }

  function workerRequest(
    command: WithoutId<SearchIndexRequest>,
  ): Promise<SearchIndexResponse> {
    worker ??= new Worker(
      new URL("./search-index.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = ({ data }: MessageEvent<SearchIndexResponse>) => {
      if (activeWorker?.id !== data.id) return;
      const request = activeWorker;
      activeWorker = undefined;
      clearTimeout(request.timer);
      request.resolve(data);
    };
    worker.onerror = () => stopWorker();
    worker.onmessageerror = () => stopWorker();
    return new Promise((resolve) => {
      const id = ++workerSequence;
      const timer = setTimeout(() => stopWorker(), 30_000);
      activeWorker = { id, resolve, timer };
      try {
        worker!.postMessage({
          ...command,
          id,
          storageBudgetBytes: readLocalMailSettings().budgetBytes,
        });
      } catch {
        stopWorker();
      }
    });
  }

  function finish(id: string, response: Result) {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    clearTimeout(request.timer);
    admitted--;
    request.resolve(response);
    if (!pending.size && probeTimer) {
      clearInterval(probeTimer);
      probeTimer = undefined;
    }
  }

  async function receive(id: string, response: Result) {
    const request = pending.get(id);
    if (!request) return;
    // The source account may have been removed while the owner was executing.
    const valid = await authorized(request.operation).catch(() => false);
    finish(id, valid ? response : { error: "stale" });
  }

  async function reply(
    sender: string,
    id: string,
    operation: Operation,
    response: Result,
  ) {
    const valid = await authorized(operation).catch(() => false);
    const safeResponse: Result = valid ? response : { error: "stale" };
    if (sender === clientId) await receive(id, safeResponse);
    else
      channel?.postMessage({
        kind: "response",
        recipient: sender,
        id,
        response: safeResponse,
      } satisfies Envelope);
  }

  function enqueue(sender: string, id: string, operation: Operation) {
    if (!owner) return;
    const key = `${sender}:${id}`;
    if (ownerJobs.has(key)) return;
    const saved = completed.get(key);
    if (saved) {
      reply(sender, id, operation, saved).catch(() => undefined);
      return;
    }
    if (ownerJobs.size >= MAX_PENDING) {
      reply(sender, id, operation, { error: "busy" }).catch(() => undefined);
      return;
    }
    ownerJobs.add(key);
    const epoch = transportEpoch;
    jobs = jobs
      .then(async () => {
        let result: Result = { error: "unavailable" };
        try {
          if (!owner || epoch !== transportEpoch) result = { error: "closed" };
          else if (!(await authorized(operation))) result = { error: "stale" };
          else {
            let response: SearchIndexResponse;
            if (operation.kind === "account") await reconcileAccounts();
            // Reconciliation may span I/O; do not dispatch an account that was
            // removed or replaced while that work was running.
            if (!(await authorized(operation))) {
              await reply(sender, id, operation, { error: "stale" });
              return;
            }
            if (operation.kind === "reconcile") {
              reconciled = false;
              await reconcileAccounts();
              response = { id: 0, result: true };
            } else if (operation.kind === "clear")
              response = await workerRequest({ command: "clearAll" });
            else if (operation.kind === "delete")
              response = await workerRequest({
                command: "deleteAccount",
                request: operation.scope,
              });
            else response = await workerRequest(operation.command);
            result =
              "error" in response
                ? { error: response.error }
                : { result: response.result };
            if (
              operation.kind === "clear" ||
              ("error" in response && response.error === "unavailable")
            )
              stopWorker();
          }
        } catch {
          stopWorker();
          result = { error: "unavailable" };
        }
        if (owner && epoch === transportEpoch) {
          completed.set(key, result);
          if (completed.size > 64)
            completed.delete(completed.keys().next().value!);
          await reply(sender, id, operation, result);
        }
      })
      .catch(() => stopWorker())
      .finally(() => {
        ownerJobs.delete(key);
      });
  }

  function tryOwn() {
    if (owner || attemptingOwnership || !pending.size || closed || !channel)
      return;
    attemptingOwnership = true;
    const epoch = transportEpoch;
    navigator.locks
      .request(LOCK, { ifAvailable: true }, async (lock) => {
        if (!lock || closed || epoch !== transportEpoch) return;
        owner = true;
        channel?.postMessage({
          kind: "owner",
          sender: clientId,
        } satisfies Envelope);
        for (const [id, request] of pending)
          enqueue(clientId, id, request.operation);
        await new Promise<void>((resolve) => {
          releaseOwnership = resolve;
        });
      })
      .catch(() => {
        for (const id of pending.keys()) finish(id, { error: "unavailable" });
      })
      .finally(() => {
        // A late callback from a previous page lifecycle cannot retire a new owner.
        if (epoch === transportEpoch) {
          attemptingOwnership = false;
          owner = false;
          releaseOwnership = undefined;
        }
      });
  }

  function startTransport() {
    if (channel) return;
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = ({ data }: MessageEvent<Envelope>) => {
      if (!data || typeof data !== "object") return;
      if (data.kind === "owner" && data.sender !== clientId) {
        for (const [id, request] of pending)
          channel?.postMessage({
            kind: "request",
            sender: clientId,
            id,
            operation: request.operation,
          } satisfies Envelope);
      } else if (
        data.kind === "request" &&
        typeof data.sender === "string" &&
        typeof data.id === "string"
      )
        enqueue(data.sender, data.id, data.operation);
      else if (data.kind === "response" && data.recipient === clientId)
        receive(data.id, data.response).catch(() =>
          finish(data.id, { error: "unavailable" }),
        );
    };
    window.addEventListener("pagehide", suspend);
  }

  function suspend() {
    transportEpoch++;
    stopWorker(); // Release OPFS handles before releasing the Web Lock.
    owner = false;
    attemptingOwnership = false;
    releaseOwnership?.();
    releaseOwnership = undefined;
    channel?.close();
    channel = undefined;
    if (probeTimer) clearInterval(probeTimer);
    probeTimer = undefined;
    for (const id of pending.keys()) finish(id, { error: "closed" });
    completed.clear();
    window.removeEventListener("pagehide", suspend);
  }

  async function submit(operation: Operation): Promise<Result> {
    if (closed) return { error: "closed" };
    if (
      typeof window === "undefined" ||
      typeof Worker === "undefined" ||
      typeof BroadcastChannel === "undefined" ||
      !navigator.locks?.request ||
      !navigator.storage?.getDirectory
    )
      return { error: "unsupported" };
    if (admitted >= MAX_PENDING) return { error: "busy" };
    admitted++;
    try {
      if (!(await authorized(operation))) {
        admitted--;
        return { error: "stale" };
      }
      if (closed) {
        admitted--;
        return { error: "closed" };
      }
      startTransport();
      const id = randomUuid();
      return new Promise((resolve) => {
        const timeout =
          operation.kind === "account" && operation.command.command === "search"
            ? 5000
            : 30_000;
        const timer = setTimeout(
          () => finish(id, { error: "timeout" }),
          timeout,
        );
        pending.set(id, { operation, resolve, timer });
        try {
          if (owner) enqueue(clientId, id, operation);
          else {
            channel!.postMessage({
              kind: "request",
              sender: clientId,
              id,
              operation,
            } satisfies Envelope);
            tryOwn();
          }
          probeTimer ??= setInterval(tryOwn, 1000);
        } catch {
          finish(id, { error: "unavailable" });
        }
      });
    } catch {
      admitted--;
      return { error: "unavailable" };
    }
  }

  return {
    request(scope: Scope, command: AccountCommand) {
      return submit({ kind: "account", scope, command });
    },
    cleanupRemovedAccounts() {
      return submit({ kind: "reconcile" });
    },
    cleanupAccount(scope: Scope) {
      return submit({ kind: "delete", scope });
    },
    clearAll() {
      return submit({ kind: "clear" });
    },
    close() {
      closed = true;
      suspend();
    },
  };
}
