import { EventEmitter } from "node:events";
import * as p from "@clack/prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmPortChanges,
  findBusyPorts,
  resolveSetupPorts,
} from "./setup-ports";

const { busyPorts } = vi.hoisted(() => ({ busyPorts: new Set<number>() }));

vi.mock("@clack/prompts", () => ({
  text: vi.fn(),
  confirm: vi.fn(),
  isCancel: vi.fn(() => false),
  cancel: vi.fn(),
  note: vi.fn(),
  log: { warn: vi.fn() },
}));

vi.mock("node:net", () => ({
  createServer: () => {
    const server = new EventEmitter();
    return Object.assign(server, {
      unref: vi.fn(),
      listen: ({ port }: { port: number }, callback: () => void) => {
        if (busyPorts.has(port)) {
          server.emit("error", { code: "EADDRINUSE" });
        } else {
          callback();
        }
      },
      close: (callback: () => void) => callback(),
    });
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  busyPorts.clear();
  vi.stubEnv("CI", "false");
  vi.spyOn(process, "stdin", "get").mockReturnValue({
    isTTY: true,
  } as typeof process.stdin);
  vi.spyOn(process, "stdout", "get").mockReturnValue({
    isTTY: true,
  } as typeof process.stdout);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("setup port selection", () => {
  it("prompts again when an earlier service reserved a later default", async () => {
    busyPorts.add(3000);
    vi.mocked(p.text)
      .mockResolvedValueOnce("5432")
      .mockResolvedValueOnce("5433");

    const result = await resolveSetupPorts({ useDockerInfra: true });

    expect(result.webPort).toBe("5432");
    expect(result.postgresPort).toBe("5433");
    expect(p.text).toHaveBeenCalledTimes(2);
    expect(p.note).toHaveBeenCalledWith(
      expect.stringContaining("POSTGRES_PORT): 5432 -> 5433"),
      "Port Configuration",
    );
  });

  it.each([
    "stdin",
    "stdout",
    "CI",
  ])("auto-picks and reports changes without prompting when %s is non-interactive", async (source) => {
    if (source === "CI") vi.stubEnv("CI", "true");
    else
      vi.spyOn(process, source, "get").mockReturnValue({
        isTTY: false,
      } as typeof process.stdin & typeof process.stdout);
    busyPorts.add(3000);
    busyPorts.add(3001);

    const result = await resolveSetupPorts({ useDockerInfra: false });

    expect(result.webPort).toBe("3002");
    expect(p.text).not.toHaveBeenCalled();
    expect(p.confirm).not.toHaveBeenCalled();
    expect(p.note).toHaveBeenCalledWith(
      expect.stringContaining("WEB_PORT): 3000 -> 3002"),
      "Port Configuration",
    );
  });
});

describe("start/update port conflicts", () => {
  it.each([
    "stdin",
    "stdout",
    "CI",
  ])("fails with busy ports and exact config commands without prompting when %s is non-interactive", async (source) => {
    if (source === "CI") vi.stubEnv("CI", "true");
    else
      vi.spyOn(process, source, "get").mockReturnValue({
        isTTY: false,
      } as typeof process.stdin & typeof process.stdout);
    busyPorts.add(3000);
    busyPorts.add(5432);
    const conflicts = await findBusyPorts({});

    await expect(confirmPortChanges(conflicts)).rejects.toThrow(
      /non-interactive mode/,
    );
    await expect(confirmPortChanges(conflicts)).rejects.toThrow(
      /Web app: 3000[\s\S]*PostgreSQL: 5432[\s\S]*inbox-zero config set WEB_PORT 3001[\s\S]*inbox-zero config set POSTGRES_PORT 5433/,
    );
    expect(p.confirm).not.toHaveBeenCalled();
    expect(p.text).not.toHaveBeenCalled();
  });
});
