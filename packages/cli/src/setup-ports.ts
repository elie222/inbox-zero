import { createServer } from "node:net";
import * as p from "@clack/prompts";

const PORT_SETTINGS = [
  { key: "WEB_PORT", label: "Web app", defaultPort: 3000 },
  { key: "POSTGRES_PORT", label: "PostgreSQL", defaultPort: 5432 },
  { key: "REDIS_PORT", label: "Redis TCP", defaultPort: 6380 },
  { key: "REDIS_HTTP_PORT", label: "Redis HTTP", defaultPort: 8079 },
] as const;

type PortSetting = (typeof PORT_SETTINGS)[number];

// Docker Desktop and many databases publish on the wildcard address (`*:5432`).
// On macOS a loopback-only bind still succeeds in that case, so every address
// Compose may bind to has to be probed.
const PROBE_HOSTS = ["127.0.0.1", "0.0.0.0", "::"] as const;

export type SetupPortConfig = {
  webPort: string;
  postgresPort: string;
  redisPort: string;
  redisHttpPort: string;
};

export type PortConflict = {
  key: PortSetting["key"];
  label: string;
  port: number;
  suggestedPort: number;
};

export async function resolveSetupPorts(options: {
  useDockerInfra: boolean;
}): Promise<SetupPortConfig> {
  const reservedPorts = new Set<number>();
  const settings = options.useDockerInfra
    ? PORT_SETTINGS
    : PORT_SETTINGS.filter((setting) => setting.key === "WEB_PORT");

  const ports: Record<string, number> = {};
  for (const setting of settings) {
    const port = (await isPortAvailable(setting.defaultPort))
      ? setting.defaultPort
      : await promptForFreePort(setting, reservedPorts);
    reservedPorts.add(port);
    ports[setting.key] = port;
  }

  return {
    webPort: String(ports.WEB_PORT),
    postgresPort: String(ports.POSTGRES_PORT ?? 5432),
    redisPort: String(ports.REDIS_PORT ?? 6380),
    redisHttpPort: String(ports.REDIS_HTTP_PORT ?? 8079),
  };
}

export async function findBusyPorts(
  env: Record<string, string | undefined>,
): Promise<PortConflict[]> {
  const configured = PORT_SETTINGS.map((setting) => ({
    setting,
    port: Number(env[setting.key]) || setting.defaultPort,
  }));
  const reservedPorts = new Set(configured.map(({ port }) => port));
  const conflicts: PortConflict[] = [];

  for (const { setting, port } of configured) {
    if (await isPortAvailable(port)) continue;
    const suggestedPort = await findFreePort(port + 1, reservedPorts);
    reservedPorts.add(suggestedPort);
    conflicts.push({
      key: setting.key,
      label: setting.label,
      port,
      suggestedPort,
    });
  }

  return conflicts;
}

export function formatPortConflicts(conflicts: PortConflict[]): string {
  return [
    "These ports are already in use by another app on this machine:",
    ...conflicts.map(
      (conflict) =>
        `- ${conflict.label}: ${conflict.port} (try ${conflict.suggestedPort})`,
    ),
    "",
    "Free the port, or move Inbox Zero to the suggested one:",
    ...conflicts.map(
      (conflict) =>
        `  inbox-zero config set ${conflict.key} ${conflict.suggestedPort}`,
    ),
  ].join("\n");
}

export async function isPortAvailable(port: number): Promise<boolean> {
  for (const host of PROBE_HOSTS) {
    if (!(await canBind(host, port))) return false;
  }
  return true;
}

async function promptForFreePort(
  setting: PortSetting,
  reservedPorts: Set<number>,
): Promise<number> {
  p.log.warn(
    `${setting.label} port ${setting.defaultPort} is already in use by another app on this machine.`,
  );

  let suggestedPort = await findFreePort(
    setting.defaultPort + 1,
    reservedPorts,
  );

  while (true) {
    const answer = await p.text({
      message: `Which port should Inbox Zero use for ${setting.label}?`,
      initialValue: String(suggestedPort),
      validate: (value) => {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65_535) {
          return "Enter a port number between 1 and 65535.";
        }
        if (reservedPorts.has(port)) {
          return `Port ${port} is already assigned to another Inbox Zero service.`;
        }
      },
    });
    if (p.isCancel(answer)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    const port = Number(answer);
    if (await isPortAvailable(port)) return port;

    p.log.warn(`Port ${port} is also in use.`);
    suggestedPort = await findFreePort(port + 1, reservedPorts);
  }
}

async function findFreePort(
  startPort: number,
  reservedPorts: Set<number>,
): Promise<number> {
  for (let port = startPort; port <= 65_535; port++) {
    if (reservedPorts.has(port)) continue;
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`Could not find an available port above ${startPort}.`);
}

function canBind(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();

    server.once("error", (error: NodeJS.ErrnoException) => {
      // Hosts without IPv6 can't probe `::`; that is not a conflict.
      resolve(error.code === "EAFNOSUPPORT" || error.code === "EADDRNOTAVAIL");
    });

    server.listen({ host, port, ipv6Only: host === "::" }, () => {
      server.close(() => resolve(true));
    });
  });
}
