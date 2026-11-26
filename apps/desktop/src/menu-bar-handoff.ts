import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import type { Session } from "electron";

const HELPER_NAME = "InboxZeroMenuBar";
const SESSION_COOKIE_NAMES = new Set([
  "__Secure-better-auth.session_token",
  "better-auth.session_token",
]);

export function isMenuBarSessionCookie(name: string) {
  return SESSION_COOKIE_NAMES.has(name);
}

export function createMenuBarHandoff({
  origin,
  contentsPath,
  session,
  openPath,
  onFailure,
  onIneligibleSession,
  commandTimeoutMs = 65_000,
}: {
  origin: string;
  contentsPath: string;
  session: {
    cookies: Pick<Session["cookies"], "get">;
    fetch: Session["fetch"];
  };
  openPath: (path: string) => Promise<string>;
  onFailure: (stage: string) => void;
  onIneligibleSession: (bundle: string) => void;
  commandTimeoutMs?: number;
}) {
  const bundle = path.join(
    contentsPath,
    "Library",
    "LoginItems",
    `${HELPER_NAME}.app`,
  );
  const executable = path.join(bundle, "Contents", "MacOS", HELPER_NAME);
  let queue = Promise.resolve();
  let handledSession: string | undefined;

  return (signingOut = false) => {
    queue = queue.then(() => reconcile(signingOut));
    return queue;
  };

  async function reconcile(signingOut: boolean) {
    let stage = "reading desktop session";
    try {
      if (new URL(origin).protocol !== "https:") return;
      if (
        !(await access(executable, constants.X_OK).then(
          () => true,
          () => false,
        ))
      )
        return;

      const desktopSession = signingOut
        ? undefined
        : await readDesktopSession();
      if (!desktopSession) {
        handledSession = undefined;
        stage = "disconnecting helper session";
        if ((await runCommand("--auth-disconnect", "")) !== 0)
          throw new Error("Helper disconnect failed");
        return;
      }
      const { fingerprint, cookieHeader } = desktopSession;
      if (handledSession === fingerprint) return;

      stage = "checking helper session";
      const status = await runCommand("--auth-status", fingerprint);
      if (status === 3) {
        handledSession = fingerprint;
        return;
      }
      if (status === 0) {
        stage = "opening helper";
        await openHelper(fingerprint);
        return;
      }
      if (status !== 2) throw new Error("Helper status failed");

      const codeVerifier = randomBytes(32).toString("base64url");
      const state = randomBytes(32).toString("base64url");
      const codeChallenge = createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");
      stage = "requesting handoff code";
      const response = await session.fetch(
        new URL("/api/mobile-auth/handoff", origin).href,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie: cookieHeader },
          body: JSON.stringify({ state, codeChallenge }),
          credentials: "omit",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (response.status === 401 || response.status === 403) {
        stage = "disconnecting helper session";
        if ((await runCommand("--auth-disconnect", "")) !== 0)
          throw new Error("Helper disconnect failed");
        if (response.status === 403) {
          handledSession = fingerprint;
          onIneligibleSession(bundle);
        }
        return;
      }
      if (!response.ok) {
        stage = `requesting handoff code (HTTP ${response.status})`;
        throw new Error("Handoff request failed");
      }

      stage = "reading handoff response";
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("code" in result) ||
        typeof result.code !== "string" ||
        !/^[A-Za-z0-9_-]{1,256}$/u.test(result.code)
      )
        throw new Error("Invalid handoff response");

      if ((await readDesktopSession())?.fingerprint !== fingerprint) return;
      stage = "redeeming handoff";
      if (
        (await runCommand(
          "--auth-handoff",
          JSON.stringify({
            baseUrl: origin,
            code: result.code,
            state,
            codeVerifier,
            desktopSessionId: fingerprint,
          }),
        )) !== 0
      )
        throw new Error("Helper rejected handoff");
      if ((await readDesktopSession())?.fingerprint !== fingerprint) return;

      stage = "opening helper";
      await openHelper(fingerprint);
    } catch {
      // HTTP bodies, paths, and subprocess output may contain private data.
      onFailure(stage);
    }
  }

  async function openHelper(fingerprint: string) {
    if (await openPath(bundle)) throw new Error("Could not open helper");
    handledSession = fingerprint;
  }

  async function readDesktopSession() {
    const cookies = await session.cookies.get({ url: origin });
    const cookie = cookies.find(
      ({ name, value }) => isMenuBarSessionCookie(name) && value,
    );
    if (!cookie) return;
    const cookieHeader = `${cookie.name}=${cookie.value}`;
    return {
      cookieHeader,
      fingerprint: createHash("sha256")
        .update(origin)
        .update("\0")
        .update(cookieHeader)
        .digest("hex"),
    };
  }

  async function runCommand(argument: string, input: string) {
    const child = spawn(executable, [argument], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    // The helper may exit before consuming stdin. Its status is authoritative.
    child.stdin.on("error", () => {});
    const signal = AbortSignal.timeout(commandTimeoutMs);
    const completion = once(child, "close", { signal });
    child.stdin.end(`${input}\n`);
    try {
      const [status] = await completion;
      return status;
    } catch (error) {
      if (signal.aborted) {
        child.kill("SIGKILL");
        child.stdin.destroy();
        child.unref();
      }
      throw error;
    }
  }
}
