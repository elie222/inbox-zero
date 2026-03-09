import { createServer } from "node:net";

const DEFAULT_PORTS = {
  web: 3000,
  postgres: 5432,
  redis: 6380,
  redisHttp: 8079,
} as const;

type ResolvedPortChange = {
  key: "WEB_PORT" | "POSTGRES_PORT" | "REDIS_PORT" | "REDIS_HTTP_PORT";
  label: string;
  defaultPort: number;
  port: number;
};

export type SetupPortConfig = {
  webPort: string;
  postgresPort: string;
  redisPort: string;
  redisHttpPort: string;
  changedPorts: ResolvedPortChange[];
};

export async function resolveSetupPorts(options: {
  useDockerInfra: boolean;
}): Promise<SetupPortConfig> {
  const reservedPorts = new Set<number>();
  const allPorts: ResolvedPortChange[] = [];

  const webPort = await reserveAvailablePort(
    {
      key: "WEB_PORT",
      label: "Web app",
      defaultPort: DEFAULT_PORTS.web,
    },
    reservedPorts,
  );
  allPorts.push(webPort);

  if (!options.useDockerInfra) {
    return {
      webPort: String(webPort.port),
      postgresPort: String(DEFAULT_PORTS.postgres),
      redisPort: String(DEFAULT_PORTS.redis),
      redisHttpPort: String(DEFAULT_PORTS.redisHttp),
      changedPorts: allPorts.filter((port) => port.port !== port.defaultPort),
    };
  }

  const postgresPort = await reserveAvailablePort(
    {
      key: "POSTGRES_PORT",
      label: "PostgreSQL",
      defaultPort: DEFAULT_PORTS.postgres,
    },
    reservedPorts,
  );
  allPorts.push(postgresPort);

  const redisPort = await reserveAvailablePort(
    {
      key: "REDIS_PORT",
      label: "Redis TCP",
      defaultPort: DEFAULT_PORTS.redis,
    },
    reservedPorts,
  );
  allPorts.push(redisPort);

  const redisHttpPort = await reserveAvailablePort(
    {
      key: "REDIS_HTTP_PORT",
      label: "Redis HTTP",
      defaultPort: DEFAULT_PORTS.redisHttp,
    },
    reservedPorts,
  );
  allPorts.push(redisHttpPort);

  return {
    webPort: String(webPort.port),
    postgresPort: String(postgresPort.port),
    redisPort: String(redisPort.port),
    redisHttpPort: String(redisHttpPort.port),
    changedPorts: allPorts.filter((port) => port.port !== port.defaultPort),
  };
}

export function formatPortConfigNote(
  changedPorts: SetupPortConfig["changedPorts"],
): string | null {
  if (changedPorts.length === 0) return null;
  return [
    "Detected busy local ports. Setup will use these host port overrides:",
    ...changedPorts.map(
      (port) => `- ${port.label}: ${port.defaultPort} -> ${port.port}`,
    ),
  ].join("\n");
}

async function reserveAvailablePort(
  port: Omit<ResolvedPortChange, "port">,
  reservedPorts: Set<number>,
): Promise<ResolvedPortChange> {
  for (
    let candidatePort = port.defaultPort;
    candidatePort <= 65_535;
    candidatePort++
  ) {
    if (reservedPorts.has(candidatePort)) continue;
    const available = await isPortAvailable(candidatePort);
    if (!available) continue;
    reservedPorts.add(candidatePort);
    return { ...port, port: candidatePort };
  }

  throw new Error(`Could not find an available port for ${port.label}.`);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();

    server.once("error", () => {
      resolve(false);
    });

    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}
