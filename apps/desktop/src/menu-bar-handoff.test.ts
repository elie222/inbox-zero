import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Cookie, Session } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMenuBarHandoff } from "./menu-bar-handoff";

const origin = "https://www.getinboxzero.com";
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe.skipIf(process.platform === "win32")(
  "desktop menu bar handoff",
  () => {
    it("redeems via stdin once per session and opens a linked helper after restart", async () => {
      const fixture = await makeFixture();
      await Promise.all([fixture.connect(), fixture.connect()]);
      await fixture.newConnection()();

      const [url, request] = fixture.fetch.mock.calls[0];
      const posted = JSON.parse(String(request?.body));
      const redeemed = JSON.parse(await readFile(fixture.payloadPath, "utf8"));
      expect(url).toBe(`${origin}/api/mobile-auth/handoff`);
      expect(request).toMatchObject({
        method: "POST",
        credentials: "omit",
        headers: { cookie: "__Secure-better-auth.session_token=first-session" },
        redirect: "error",
      });
      expect(redeemed).toEqual({
        baseUrl: origin,
        code: "fixture-code",
        state: posted.state,
        codeVerifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
        desktopSessionId: expect.stringMatching(/^[a-f0-9]{64}$/u),
      });
      expect(posted.codeChallenge).toBe(
        createHash("sha256").update(redeemed.codeVerifier).digest("base64url"),
      );
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
      expect(fixture.openPath.mock.calls).toEqual([
        [fixture.bundle],
        [fixture.bundle],
      ]);

      fixture.setSession("second-session");
      await fixture.connect();
      expect(fixture.fetch).toHaveBeenCalledTimes(2);
      expect(fixture.openPath).toHaveBeenCalledTimes(3);
      expect(fixture.onFailure).not.toHaveBeenCalled();
    });

    it("does no network work if the helper or desktop session is missing", async () => {
      const fixture = await makeFixture();
      fixture.setSession("");
      await fixture.connect();
      fixture.setSession("first-session");
      await rm(fixture.bundle, { recursive: true });
      await fixture.connect();
      expect(fixture.fetch).not.toHaveBeenCalled();
      expect(fixture.openPath).not.toHaveBeenCalled();
    });

    it("skips an obsolete handoff if the desktop session changes during the request", async () => {
      const fixture = await makeFixture();
      fixture.fetch.mockImplementationOnce(async () => {
        fixture.setSession("second-session");
        return Response.json({ code: "old-session-code" });
      });
      await fixture.connect();
      expect(fixture.openPath).not.toHaveBeenCalled();
      await fixture.connect();
      expect(fixture.openPath).toHaveBeenCalledOnce();
      expect(JSON.parse(await readFile(fixture.payloadPath, "utf8")).code).toBe(
        "fixture-code",
      );
    });

    it("repairs the helper when the desktop switches back during redemption", async () => {
      const fixture = await makeFixture();
      await fixture.connect();
      const originalSession = await readFile(fixture.sessionPath, "utf8");
      fixture.setSession("second-session");
      fixture.verifyHelper
        .mockResolvedValueOnce(undefined)
        .mockImplementationOnce(async () =>
          fixture.setSession("first-session"),
        );

      await fixture.connect();
      expect(await readFile(fixture.sessionPath, "utf8")).not.toBe(
        originalSession,
      );
      await fixture.connect();
      expect(await readFile(fixture.sessionPath, "utf8")).toBe(originalSession);
    });

    it("forwards both supported session cookies when they coexist", async () => {
      const fixture = await makeFixture();
      fixture.setCookies([
        { name: "better-auth.session_token", sameSite: "lax", value: "old" },
        {
          name: "__Secure-better-auth.session_token",
          sameSite: "lax",
          value: "current",
        },
        { name: "other_cookie", sameSite: "lax", value: "unrelated" },
      ]);
      await fixture.connect();
      expect(fixture.fetch.mock.calls[0][1]?.headers).toMatchObject({
        cookie:
          "better-auth.session_token=old; __Secure-better-auth.session_token=current",
      });
    });

    it("ignores an auth rejection for a session the desktop has switched away from", async () => {
      const fixture = await makeFixture();
      await fixture.connect();
      const linkedSession = await readFile(fixture.sessionPath, "utf8");
      fixture.setSession("second-session");
      fixture.fetch.mockImplementationOnce(async () => {
        fixture.setSession("first-session");
        return new Response(null, { status: 401 });
      });
      await fixture.connect();
      expect(await readFile(fixture.sessionPath, "utf8")).toBe(linkedSession);
    });

    it("retries on the next connection attempt when the helper rejects the code", async () => {
      const fixture = await makeFixture();
      await writeFile(
        fixture.executable,
        '#!/bin/sh\n[ "$1" = "--auth-status" ] && exit 2\nexit 1\n',
      );
      await fixture.connect();
      expect(fixture.onFailure).toHaveBeenCalledExactlyOnceWith(
        "redeeming handoff",
      );
      expect(fixture.openPath).not.toHaveBeenCalled();
      await fixture.installHelper();
      await fixture.connect();
      expect(fixture.openPath).toHaveBeenCalledOnce();
    });

    it("disconnects after a pending handoff and preserves standalone sign-in", async () => {
      const fixture = await makeFixture();
      let disconnect = Promise.resolve();
      fixture.verifyHelper
        .mockResolvedValueOnce(undefined)
        .mockImplementationOnce(async () => {
          fixture.setSession("");
          disconnect = fixture.connect();
        });
      await fixture.connect();
      await disconnect;
      await expect(readFile(fixture.sessionPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await writeFile(fixture.sessionPath, "standalone");
      fixture.setSession("");
      await fixture.connect();
      expect(await readFile(fixture.sessionPath, "utf8")).toBe("standalone");
    });

    it("keeps the helper connected when an obsolete session cookie disappears", async () => {
      const fixture = await makeFixture();
      fixture.setCookies([
        {
          name: "better-auth.session_token",
          sameSite: "lax",
          value: "obsolete",
        },
        {
          name: "__Secure-better-auth.session_token",
          sameSite: "lax",
          value: "current",
        },
      ]);
      await fixture.connect();
      fixture.setSession("current");
      await fixture.connect();
      expect(await readFile(fixture.sessionPath, "utf8")).toMatch(
        /^[a-f0-9]{64}$/u,
      );
      expect(fixture.fetch.mock.calls[1][1]?.headers).toMatchObject({
        cookie: "__Secure-better-auth.session_token=current",
      });
    });

    it("reconnects an expired helper session on a later desktop startup", async () => {
      const fixture = await makeFixture();
      await fixture.connect();
      await rm(fixture.sessionPath);
      await fixture.newConnection()();
      expect(fixture.fetch).toHaveBeenCalledTimes(2);
    });

    it("offers standalone sign-in once for an ineligible desktop session", async () => {
      const fixture = await makeFixture();
      fixture.fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
      await fixture.connect();
      await fixture.connect();
      expect(fixture.onIneligibleSession).toHaveBeenCalledExactlyOnceWith(
        fixture.bundle,
      );
      expect(fixture.openPath).not.toHaveBeenCalled();
    });

    it("terminates a stuck helper command and lets the next operation proceed", async () => {
      const fixture = await makeFixture(2500);
      await writeFile(
        fixture.executable,
        '#!/bin/sh\ntrap "" TERM\nexec sleep 30\n',
      );
      await fixture.connect();
      expect(fixture.onFailure).toHaveBeenCalledExactlyOnceWith(
        "checking helper session",
      );
      await fixture.installHelper();
      await fixture.connect();
      expect(fixture.openPath).toHaveBeenCalledOnce();
    });

    it("requires the helper signature before requesting or delivering a handoff", async () => {
      const fixture = await makeFixture();
      fixture.verifyHelper.mockRejectedValueOnce(new Error("Unsigned helper"));
      await fixture.connect();
      expect(fixture.fetch).not.toHaveBeenCalled();
      fixture.verifyHelper
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Helper signature changed"));
      await fixture.connect();
      expect(fixture.fetch).toHaveBeenCalledOnce();
      expect(fixture.openPath).not.toHaveBeenCalled();
      await expect(readFile(fixture.payloadPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(fixture.onFailure.mock.calls).toEqual([
        ["verifying helper signature"],
        ["verifying helper signature"],
      ]);
    });
  },
);

async function makeFixture(commandTimeoutMs?: number) {
  const contentsPath = await mkdtemp(path.join(tmpdir(), "desktop-menubar-"));
  tempDirectories.push(contentsPath);
  const bundle = path.join(
    contentsPath,
    "Library",
    "LoginItems",
    "InboxZeroMenuBar.app",
  );
  const executable = path.join(bundle, "Contents", "MacOS", "InboxZeroMenuBar");
  const payloadPath = `${executable}.input`;
  const sessionPath = `${executable}.session`;
  await mkdir(path.dirname(executable), { recursive: true });

  const installHelper = () =>
    writeFile(
      executable,
      `#!/bin/sh
case "$1" in
  --auth-status)
    IFS= read -r line || exit 1
    saved=$(cat "$0.session" 2>/dev/null)
    [ "$saved" = standalone ] && exit 3
    [ "$saved" = "$line" ] && exit 0
    exit 2 ;;
  --auth-handoff)
    IFS= read -r line || exit 1
    printf "%s" "$line" > "$0.input"
    printf "%s" "$line" | sed -E 's/.*"desktopSessionId":"([0-9a-f]+)".*/\\1/' > "$0.session" ;;
  --auth-disconnect)
    [ "$(cat "$0.session" 2>/dev/null)" = standalone ] || rm -f "$0.session" ;;
  *) exit 1 ;;
esac
`,
      { mode: 0o700 },
    );
  await installHelper();

  let cookies: Cookie[] = [];
  function setSession(value: string) {
    cookies = value
      ? [{ name: "__Secure-better-auth.session_token", sameSite: "lax", value }]
      : [];
  }
  setSession("first-session");
  const fetch = vi.fn<Session["fetch"]>(async () =>
    Response.json({ code: "fixture-code" }),
  );
  const openPath = vi.fn<(bundle: string) => Promise<string>>(async () => "");
  const onFailure = vi.fn();
  const onIneligibleSession = vi.fn();
  const verifyHelper = vi.fn<(bundle: string) => Promise<void>>(async () => {});
  const newConnection = () =>
    createMenuBarHandoff({
      origin,
      contentsPath,
      commandTimeoutMs,
      session: {
        cookies: {
          get: async () => cookies,
        },
        fetch,
      },
      openPath,
      onFailure,
      onIneligibleSession,
      verifyHelper,
    });

  return {
    bundle,
    executable,
    payloadPath,
    sessionPath,
    installHelper,
    fetch,
    openPath,
    onFailure,
    onIneligibleSession,
    verifyHelper,
    newConnection,
    connect: newConnection(),
    setSession,
    setCookies: (values: Cookie[]) => {
      cookies = values;
    },
  };
}
