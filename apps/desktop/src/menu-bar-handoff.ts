import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Session } from "electron";

const HELPER_NAME = "InboxZeroMenuBar";
const HELPER_BUNDLE_ID = "com.getinboxzero.desktop.menubar";
const codesign = promisify(execFile);
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
  verifyHelper = verifyMenuBarSignature,
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
  verifyHelper?: (bundle: string) => Promise<void>;
  commandTimeoutMs?: number;
}) {
  const bundle = path.join(
    contentsPath,
    "Library",
    "LoginItems",
    `${HELPER_NAME}.app`,
  );
  const executable = path.join(bundle, "Contents", "MacOS", HELPER_NAME);
  const handoffUrl = new URL("/api/mobile-auth/handoff", origin);
  let queue = Promise.resolve();
  let handledSession: string | undefined;

  return () => {
    queue = queue.then(reconcile);
    return queue;
  };

  async function reconcile() {
    let stage = "reading desktop session";
    try {
      if (handoffUrl.protocol !== "https:") return;
      if (
        !(await access(executable, constants.X_OK).then(
          () => true,
          () => false,
        ))
      )
        return;

      const desktopSession = await readDesktopSession();
      if (desktopSession && handledSession === desktopSession.fingerprint)
        return;
      handledSession = undefined;

      if (!desktopSession) {
        stage = "disconnecting helper session";
        if ((await runCommand("--auth-disconnect", "")) !== 0)
          throw new Error("Helper disconnect failed");
        return;
      }
      const { fingerprint, cookieHeader } = desktopSession;

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
      const response = await session.fetch(handoffUrl.href, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({ state, codeChallenge }),
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 401 || response.status === 403) {
        if ((await readDesktopSession())?.fingerprint !== fingerprint) return;
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
      stage = "opening helper";
      await openHelper(fingerprint);
    } catch (error) {
      // HTTP bodies, paths, and subprocess output may contain private data.
      onFailure(
        error instanceof InvalidHelperSignature
          ? "verifying helper signature"
          : stage,
      );
    }
  }

  async function openHelper(fingerprint: string) {
    if ((await readDesktopSession())?.fingerprint !== fingerprint) return;
    if (await openPath(bundle)) throw new Error("Could not open helper");
    handledSession = fingerprint;
  }

  async function readDesktopSession() {
    const cookies = await session.cookies.get({ url: handoffUrl.href });
    const cookieHeader = cookies
      .filter(({ name, value }) => isMenuBarSessionCookie(name) && value)
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");
    if (!cookieHeader) return;
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
    try {
      await verifyHelper(bundle);
    } catch {
      throw new InvalidHelperSignature();
    }
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

class InvalidHelperSignature extends Error {}

async function verifyMenuBarSignature(bundle: string) {
  const options = { timeout: 5000, killSignal: "SIGKILL" as const };
  const { stderr } = await codesign(
    "/usr/bin/codesign",
    ["--display", "--verbose=4", process.execPath],
    options,
  );
  const team = /^TeamIdentifier=([A-Z0-9]{10})$/mu.exec(stderr)?.[1];
  if (!team) throw new Error("Desktop signing team is missing");

  const requirement = [
    "anchor apple generic",
    `identifier "${HELPER_BUNDLE_ID}"`,
    "certificate 1[field.1.2.840.113635.100.6.2.6] exists",
    "certificate leaf[field.1.2.840.113635.100.6.1.13] exists",
    `certificate leaf[subject.OU] = "${team}"`,
  ].join(" and ");
  await codesign(
    "/usr/bin/codesign",
    ["--verify", "--strict", `-R=${requirement}`, bundle],
    options,
  );
}
