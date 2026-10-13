import { spawn, execFile } from "node:child_process";
import { mkdtemp, realpath, rm, access, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import type { Dirent } from "node:fs";

const MAX_OUTPUT = 16 * 1024 * 1024;
const MAX_MEMORY_KB = 512 * 1024;
let active = 0;
const waiting: (() => void)[] = [];
let modulePaths: Promise<string[]> | undefined;

export async function runIsolatedExtractor(
  executable: string,
  args: string[],
  request: unknown,
  limits: { timeoutMs?: number; outputBytes?: number; memoryKb?: number } = {},
): Promise<unknown> {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  let scratch: string | undefined;
  try {
    const input = Buffer.from(JSON.stringify(request));
    if (input.length > 36 * 1024 * 1024)
      throw new Error("Spam extraction input exceeds its limit");
    scratch = await mkdtemp(join(tmpdir(), "inbox-zero-extract-"));
    const binary = await realpath(executable);
    const command = await restrictedCommand(binary, args, scratch);
    return await new Promise((resolve, reject) => {
      const child = spawn(command.file, command.args, {
        env: {
          PATH: "/usr/bin:/bin",
          LANG: "en_US.UTF-8",
          HOME: scratch,
          TMPDIR: scratch,
          OPENSSL_CONF: "/dev/null",
          NODE_ENV: "production",
        },
        stdio: ["pipe", "pipe", "pipe"],
        cwd: scratch,
      });
      const chunks: Buffer[] = [];
      let bytes = 0;
      let failure: Error | undefined;
      let checkingMemory = false;
      const fail = (message: string) => {
        failure ??= new Error(message);
        child.kill("SIGKILL");
      };
      const timer = setTimeout(
        () => fail("Spam extraction timed out"),
        limits.timeoutMs ?? 30_000,
      );
      const memoryTimer = setInterval(() => {
        if (checkingMemory || !child.pid) return;
        checkingMemory = true;
        const workerPid = child.pid;
        const processTree = process.platform === "linux";
        execFile(
          "/bin/ps",
          processTree
            ? ["-e", "-o", "pid=,ppid=,rss="]
            : ["-o", "rss=", "-p", String(workerPid)],
          { timeout: 1000, maxBuffer: processTree ? 1024 * 1024 : 1024 },
          (error, output) => {
            checkingMemory = false;
            if (child.exitCode !== null || child.signalCode !== null) return;
            if (error) {
              fail("Could not monitor spam extraction memory");
              return;
            }
            const memoryKb = processTree
              ? descendantMemory(output, workerPid)
              : Number(output.trim());
            if (!Number.isFinite(memoryKb)) {
              fail("Invalid spam extraction memory report");
              return;
            }
            if (memoryKb > (limits.memoryKb ?? MAX_MEMORY_KB))
              fail("Spam extraction exceeded its memory budget");
          },
        );
      }, 100);
      child.stdout.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > (limits.outputBytes ?? MAX_OUTPUT))
          fail("Spam extraction output exceeds its limit");
        else chunks.push(chunk);
      });
      // Decoder diagnostics can contain message text. Drain them without logging.
      child.stderr.resume();
      child.stdin.on("error", () => {});
      child.on("error", () => {
        failure ??= new Error("Could not start restricted spam extraction");
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        clearInterval(memoryTimer);
        if (failure) return reject(failure);
        if (code !== 0)
          return reject(new Error("Restricted spam extraction failed"));
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(new Error("Invalid spam extraction response"));
        }
      });
      child.stdin.end(input);
    });
  } finally {
    try {
      if (scratch) await rm(scratch, { recursive: true, force: true });
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }
}

export async function restrictedCommand(
  binary: string,
  args: string[],
  scratch: string,
) {
  if (process.platform === "darwin") {
    const reads = [
      "/System",
      "/usr/lib",
      "/usr/share/icu",
      "/usr/share/tokenizer",
      "/usr/share/mecabra",
      "/usr/share/langid",
      "/usr/share/com.apple.languageassetd",
      "/Library/Apple",
      "/Library/Fonts",
      "/private/var/db/dyld",
    ];
    const paths = [binary, ...args.filter((arg) => arg.startsWith("/"))];
    // Node's portable worker needs its dependency tree, never the app's .env files.
    if (binary === (await realpath(process.execPath))) {
      reads.push(...(await portableModulePaths()));
      for (const cellar of ["/opt/homebrew/Cellar", "/usr/local/Cellar"])
        if (binary.startsWith(`${cellar}/`)) reads.push(cellar);
    }
    const quote = (value: string) => JSON.stringify(value);
    const profile = `(version 1)
(allow default)
(deny network*)
(deny appleevent-send)
(deny process-fork)
(deny process-exec)
(allow process-exec (literal ${quote(binary)}))
(deny file-read*)
(allow file-read-metadata)
(allow file-read* (literal "/"))
${reads.map((path) => `(allow file-read* (subpath ${quote(path)}))`).join("\n")}
${paths.map((path) => `(allow file-read* (literal ${quote(path)}))`).join("\n")}
(allow file-read* (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random"))
(allow file-read* (subpath ${quote(scratch)}))
(deny file-write*)
(allow file-write* (subpath ${quote(scratch)}) (literal "/dev/null"))`;
    return {
      file: "/usr/bin/sandbox-exec",
      args: ["-p", profile, binary, ...args],
    };
  }
  if (process.platform === "linux") {
    await access("/usr/bin/bwrap");
    const paths = [
      "/usr",
      "/lib",
      "/lib64",
      dirname(binary),
      ...args.filter((arg) => arg.startsWith("/")),
      ...(await portableModulePaths()),
    ];
    const bindings: string[] = [];
    for (const path of new Set(paths)) {
      try {
        await access(path);
        bindings.push("--ro-bind", path, path);
      } catch {
        /* Optional platform library directory. */
      }
    }
    return {
      file: "/usr/bin/bwrap",
      args: [
        "--unshare-all",
        "--die-with-parent",
        "--new-session",
        ...bindings,
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        "--tmpfs",
        scratch,
        "--chdir",
        scratch,
        "--",
        binary,
        ...args,
      ],
    };
  }
  throw new Error(
    "A restricted spam extraction worker is not available on this platform",
  );
}

function portableModulePaths() {
  modulePaths ??= (async () => {
    const require = createRequire(join(process.cwd(), "package.json"));
    const pending: string[] = [];
    const directories = new Set<string>();
    const paths = new Set<string>([join(process.cwd(), "node_modules")]);
    for (const name of ["pdfjs-dist", "sharp", "@napi-rs/canvas"]) {
      const entry = await realpath(require.resolve(name));
      const index = entry.lastIndexOf("/node_modules/");
      pending.push(entry.slice(0, index + "/node_modules".length));
    }
    while (pending.length) {
      const directory = pending.pop()!;
      if (directories.has(directory)) continue;
      directories.add(directory);
      let entries: Dirent[];
      try {
        paths.add(await realpath(directory));
        entries = await readdir(directory, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const path = join(directory, entry.name);
        if (entry.name.startsWith("@") && entry.isDirectory())
          pending.push(path);
        else if (entry.isSymbolicLink()) {
          let target: string;
          try {
            target = await realpath(path);
          } catch {
            continue;
          }
          paths.add(target);
          const index = target.lastIndexOf("/node_modules/");
          if (index >= 0)
            pending.push(target.slice(0, index + "/node_modules".length));
          pending.push(join(target, "node_modules"));
        }
      }
    }
    return [...paths];
  })();
  return modulePaths;
}

function descendantMemory(output: string, workerPid: number) {
  const processes = output
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/u).map(Number));
  const descendants = new Set([workerPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, parent] of processes)
      if (descendants.has(parent) && !descendants.has(pid)) {
        descendants.add(pid);
        changed = true;
      }
  }
  return processes.reduce(
    (sum, [pid, , memory]) => sum + (descendants.has(pid) ? memory : 0),
    0,
  );
}
