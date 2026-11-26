import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { constants } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Session } from "electron";

const HELPER_NAME = "InboxZeroMenuBar";
const SESSION_COOKIE_NAMES = new Set([
  "__Secure-better-auth.session_token",
  "better-auth.session_token",
]);

export function createMenuBarHandoff({
  origin,
  contentsPath,
  markerPath,
  session,
  openPath,
  onFailure,
}: {
  origin: string;
  contentsPath: string;
  markerPath: string;
  session: {
    cookies: Pick<Session["cookies"], "get">;
    fetch: Session["fetch"];
  };
  openPath: (path: string) => Promise<string>;
  onFailure: () => void;
}) {
  const bundle = path.join(
    contentsPath,
    "Library",
    "LoginItems",
    `${HELPER_NAME}.app`,
  );
  const executable = path.join(bundle, "Contents", "MacOS", HELPER_NAME);
  let queue = Promise.resolve();

  return () => {
    // An account change during startup must finish after the original handoff.
    queue = queue.then(connect).catch(() => onFailure());
    return queue;
  };

  async function connect() {
    if (new URL(origin).protocol !== "https:") return;
    if (
      !(await access(executable, constants.X_OK).then(
        () => true,
        () => false,
      ))
    )
      return;

    const fingerprint = await sessionFingerprint();
    if (!fingerprint) return;
    const previous = await readFile(markerPath, "utf8").catch(() => "");
    if (previous === fingerprint) return;

    const codeVerifier = randomBytes(32).toString("base64url");
    const state = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    const response = await session.fetch(
      new URL("/api/mobile-auth/handoff", origin).href,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state, codeChallenge }),
        credentials: "include",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (response.status === 401 || response.status === 403) return;
    if (!response.ok) throw new Error("Could not connect the menu bar helper");

    const result: unknown = await response.json();
    if (
      !result ||
      typeof result !== "object" ||
      !("code" in result) ||
      typeof result.code !== "string" ||
      !/^[A-Za-z0-9_-]{1,256}$/u.test(result.code)
    )
      throw new Error("Invalid menu bar handoff response");

    if ((await sessionFingerprint()) !== fingerprint) return;
    await redeem(executable, {
      baseUrl: origin,
      code: result.code,
      state,
      codeVerifier,
    });
    if (await openPath(bundle))
      throw new Error("Could not open the menu bar helper");
    await writeFile(markerPath, fingerprint, { encoding: "utf8", mode: 0o600 });
  }

  async function sessionFingerprint() {
    const cookies = await session.cookies.get({ url: origin });
    const cookie = cookies.find(
      ({ name, value }) => SESSION_COOKIE_NAMES.has(name) && value,
    );
    if (!cookie) return;
    return createHash("sha256")
      .update(origin)
      .update("\0")
      .update(cookie.value)
      .digest("hex");
  }
}

async function redeem(
  executable: string,
  handoff: {
    baseUrl: string;
    code: string;
    state: string;
    codeVerifier: string;
  },
) {
  const child = spawn(executable, ["--auth-handoff"], {
    stdio: ["pipe", "ignore", "ignore"],
    timeout: 65_000,
  });
  // The helper may exit before consuming stdin. Its status is authoritative.
  child.stdin.on("error", () => {});
  child.stdin.end(`${JSON.stringify(handoff)}\n`);
  const [status] = await once(child, "close");
  if (status !== 0) throw new Error("The menu bar helper rejected the handoff");
}
