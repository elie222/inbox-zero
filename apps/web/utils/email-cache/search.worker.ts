import { searchCachedMail, type LocalSearchRequest } from "./search";

type SearchJob = { id: number; request: LocalSearchRequest };
let pending: SearchJob | undefined;
let running = false;
self.onmessage = (event: MessageEvent<SearchJob>) => {
  pending = event.data;
  if (!running)
    runSearches().catch(() => {
      running = false;
    });
};

async function runSearches() {
  running = true;
  // Coalesce fast typing rather than queueing a cache scan for every keystroke.
  while (pending) {
    const { id, request } = pending;
    pending = undefined;
    try {
      self.postMessage({ id, result: await searchCachedMail(request) });
    } catch {
      self.postMessage({
        id,
        result: { status: "unavailable", threads: [] },
      });
    }
  }
  running = false;
}
