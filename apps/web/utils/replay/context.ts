import { AsyncLocalStorage } from "node:async_hooks";
import type { RecordingSessionHandle } from "./recorder";

const replayStorage = new AsyncLocalStorage<RecordingSessionHandle>();

export function runWithRecordingSession<T>(
  session: RecordingSessionHandle,
  fn: () => T,
): T {
  return replayStorage.run(session, fn);
}

export function getRecordingSession(): RecordingSessionHandle | undefined {
  return replayStorage.getStore();
}
