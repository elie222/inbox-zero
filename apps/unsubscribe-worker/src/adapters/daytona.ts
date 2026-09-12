import { Daytona } from "@daytona/sdk";
import {
  SandboxCleanupUnconfirmed,
  resultSchema,
  type SandboxAdapter,
} from "../contracts.ts";

export function daytonaAdapter({
  apiKey,
  apiUrl,
  snapshot,
  strictNetworkPolicy,
}: {
  apiKey: string;
  apiUrl?: string;
  snapshot: string;
  strictNetworkPolicy: "verified";
}): SandboxAdapter {
  if (strictNetworkPolicy !== "verified")
    throw new Error("Strict network policy required");
  const daytona = new Daytona({ apiKey, apiUrl });
  return {
    async create({ jobId, brokerIp, brokerPort, signal }) {
      signal.throwIfAborted();
      const sandbox = await daytona.create(
        {
          name: `unsubscribe-${jobId}`,
          snapshot,
          public: false,
          // Daytona allowlists are CIDR-only. Broker-port restriction is a
          // dedicated-host requirement; verify-egress also samples other ports.
          networkAllowList: `${brokerIp}/32`,
          autoStopInterval: 3,
          autoDeleteInterval: 0,
          ttlMinutes: 3,
          labels: { purpose: "unsubscribe" },
        },
        { timeout: 45 },
      );
      let deletion: Promise<void> | undefined;
      const destroy = () => (deletion ??= daytona.delete(sandbox, 30, true));
      try {
        signal.throwIfAborted();
        const probe = await sandbox.process.executeCommand(
          `node /app/src/verify-egress.ts ${brokerIp} ${brokerPort}`,
          undefined,
          undefined,
          10,
        );
        if (probe.exitCode !== 0)
          throw new Error("Network isolation check failed");
        signal.throwIfAborted();
      } catch {
        try {
          await destroy();
        } catch {
          throw new SandboxCleanupUnconfirmed();
        }
        throw new Error("Sandbox isolation unavailable");
      }
      return {
        async run(input, signal) {
          signal.throwIfAborted();
          await sandbox.fs.uploadFile(
            Buffer.from(JSON.stringify(input)),
            "/tmp/unsubscribe-job.json",
          );
          signal.throwIfAborted();
          const abort = () => {
            destroy().catch(() => {});
          };
          signal.addEventListener("abort", abort, { once: true });
          try {
            const response = await sandbox.process.executeCommand(
              "node /app/src/runner.ts file",
              undefined,
              undefined,
              120,
            );
            signal.throwIfAborted();
            if (response.exitCode !== 0 || response.result.length > 1024)
              throw new Error("Sandbox failed");
            return resultSchema.parse(JSON.parse(response.result));
          } finally {
            signal.removeEventListener("abort", abort);
          }
        },
        destroy,
      };
    },
  };
}
