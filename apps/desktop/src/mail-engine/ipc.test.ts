import { describe, expect, it } from "vitest";
import { dispatchMailIpc } from "./ipc";

describe("dispatchMailIpc", () => {
  it("rejects an older IPC protocol version without touching the engine", async () => {
    const result = await dispatchMailIpc({} as never, {
      protocolVersion: 0,
      requestId: "req-1",
      method: "getDiagnostics",
      payload: { accountId: "acc-1" },
    });
    expect(result).toMatchObject({ status: "invalid" });
  });

  it("rejects a missing IPC protocol version", async () => {
    const result = await dispatchMailIpc({} as never, {
      requestId: "req-1",
      method: "getDiagnostics",
      payload: { accountId: "acc-1" },
    });
    expect(result).toMatchObject({ status: "invalid" });
  });
});
