import { spawn } from "node:child_process";
import {
  SandboxCleanupUnconfirmed,
  resultSchema,
  type SandboxAdapter,
} from "../contracts.ts";

type Command = (
  binary: string,
  args: string[],
  options?: { input?: string; signal?: AbortSignal; timeout?: number },
) => Promise<string>;

export function dockerAdapter({
  image,
  routerImage,
  command = runCommand,
}: {
  image: string;
  routerImage: string;
  command?: Command;
}): SandboxAdapter {
  return {
    async create({ jobId, brokerIp, brokerPort, signal }) {
      signal.throwIfAborted();
      const name = `unsubscribe-${jobId}`;
      const router = `${name}-router`;
      const timer = `${name}-expiry`;
      // The host timer survives coordinator crashes and a compromised guest.
      await command(
        "systemd-run",
        [
          "--quiet",
          `--unit=${timer}`,
          "--on-active=180s",
          "/usr/bin/docker",
          "rm",
          "-f",
          name,
          router,
        ],
        { signal },
      );
      const destroy = async () => {
        await Promise.all(
          [name, router].map(async (container) => {
            const exists = await command(
              "docker",
              [
                "container",
                "ls",
                "-a",
                "--filter",
                `name=^/${container}$`,
                "--format",
                "{{.Names}}",
              ],
              { timeout: 5000 },
            );
            if (exists.trim() === container)
              await command("docker", ["rm", "-f", container], {
                timeout: 10_000,
              });
            else if (exists.trim())
              throw new Error("Unexpected container lookup");
          }),
        );
        await command("systemctl", ["stop", `${timer}.timer`], {
          timeout: 5000,
        });
      };
      try {
        await command(
          "docker",
          [
            "run",
            "--detach",
            "--rm",
            "--name",
            router,
            "--read-only",
            "--cap-drop=ALL",
            "--cap-add=NET_ADMIN",
            "--security-opt=no-new-privileges",
            "--memory=32m",
            "--pids-limit=32",
            "--tmpfs=/tmp:rw,noexec,nosuid,size=1m",
            "--dns=127.0.0.1",
            "--env",
            `BROKER_IP=${brokerIp}`,
            "--env",
            `BROKER_PORT=${brokerPort}`,
            routerImage,
          ],
          { signal },
        );
        await command(
          "docker",
          [
            "exec",
            router,
            "sh",
            "-c",
            "until test -f /tmp/ready; do sleep 0.1; done",
          ],
          { timeout: 10_000, signal },
        );
      } catch {
        try {
          await destroy();
        } catch {
          throw new SandboxCleanupUnconfirmed();
        }
        throw new Error("Sandbox creation failed");
      }
      return {
        async run(input, signal) {
          const result = await command(
            "docker",
            [
              "run",
              "--interactive",
              "--rm",
              "--name",
              name,
              "--runtime=runsc",
              `--network=container:${router}`,
              "--user=1000:1000",
              "--read-only",
              "--cap-drop=ALL",
              "--security-opt=no-new-privileges",
              "--init",
              "--memory=1g",
              "--cpus=1",
              "--pids-limit=256",
              "--shm-size=128m",
              "--tmpfs=/tmp:rw,nosuid,size=256m,mode=1777",
              image,
              "node",
              "/app/src/runner.ts",
            ],
            { input: JSON.stringify(input), signal, timeout: 125_000 },
          );
          if (result.length > 1024) throw new Error("Invalid sandbox result");
          return resultSchema.parse(JSON.parse(result));
        },
        destroy,
      };
    },
  };
}

async function runCommand(
  binary: string,
  args: string[],
  options: { input?: string; signal?: AbortSignal; timeout?: number } = {},
) {
  return new Promise<string>((resolve, reject) => {
    const process = spawn(binary, args, {
      stdio: ["pipe", "pipe", "pipe"],
      signal: options.signal,
    });
    let output = "";
    const timeout = setTimeout(
      () => process.kill("SIGKILL"),
      options.timeout ?? 30_000,
    );
    process.stdout.on("data", (data) => {
      output += data;
      if (output.length > 1024 * 1024) process.kill("SIGKILL");
    });
    process.stderr.on("data", () => {});
    process.stdin.on("error", () => {});
    process.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("Sandbox command failed"));
    });
    process.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output);
      else reject(new Error("Sandbox command failed"));
    });
    process.stdin.end(options.input);
  });
}
