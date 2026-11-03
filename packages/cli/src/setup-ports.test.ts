import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { findBusyPorts, isPortAvailable } from "./setup-ports";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

describe("isPortAvailable", () => {
  it("reports a port held on the IPv4 wildcard address as busy", async () => {
    const port = await listen("0.0.0.0");
    expect(await isPortAvailable(port)).toBe(false);
  });

  it("reports a port held on the IPv6 wildcard address as busy", async () => {
    // Docker Desktop publishes container ports this way, e.g. `*:5432`.
    const port = await listen("::");
    expect(await isPortAvailable(port)).toBe(false);
  });

  it("reports a port held on loopback as busy", async () => {
    const port = await listen("127.0.0.1");
    expect(await isPortAvailable(port)).toBe(false);
  });

  it("reports a free port as available", async () => {
    const port = await listen("127.0.0.1");
    await new Promise<void>((resolve) => servers.pop()?.close(() => resolve()));
    expect(await isPortAvailable(port)).toBe(true);
  });
});

describe("findBusyPorts", () => {
  it("returns configured ports that are taken, with a free suggestion", async () => {
    const busyPort = await listen("::");

    const conflicts = await findBusyPorts({ POSTGRES_PORT: String(busyPort) });

    const postgres = conflicts.find((c) => c.key === "POSTGRES_PORT");
    expect(postgres?.port).toBe(busyPort);
    expect(postgres?.suggestedPort).not.toBe(busyPort);
    expect(await isPortAvailable(postgres?.suggestedPort ?? busyPort)).toBe(
      true,
    );
  });

  it("suggests distinct ports when several conflicts are found", async () => {
    const webPort = await listen("::");
    const postgresPort = await listen("::");

    const conflicts = await findBusyPorts({
      WEB_PORT: String(webPort),
      POSTGRES_PORT: String(postgresPort),
    });

    const suggestions = conflicts
      .filter((c) => c.key === "WEB_PORT" || c.key === "POSTGRES_PORT")
      .map((c) => c.suggestedPort);
    expect(suggestions).toHaveLength(2);
    expect(new Set(suggestions).size).toBe(2);
  });
});

function listen(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ host, port: 0 }, () => {
      servers.push(server);
      const address = server.address();
      if (address && typeof address === "object") resolve(address.port);
    });
  });
}
