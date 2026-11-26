import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Session } from "electron";
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
    it("redeems a fresh PKCE handoff via stdin and connects each desktop session once", async () => {
      const fixture = await makeFixture();
      await Promise.all([fixture.connect(), fixture.connect()]);
      await fixture.newConnection()();

      const [url, request] = fixture.fetch.mock.calls[0];
      const posted = JSON.parse(String(request?.body));
      const redeemed = JSON.parse(await readFile(fixture.payloadPath, "utf8"));
      expect(url).toBe(`${origin}/api/mobile-auth/handoff`);
      expect(request).toMatchObject({
        method: "POST",
        credentials: "include",
        redirect: "error",
      });
      expect(redeemed).toEqual({
        baseUrl: origin,
        code: "fixture-code",
        state: posted.state,
        codeVerifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
      });
      expect(posted.codeChallenge).toBe(
        createHash("sha256").update(redeemed.codeVerifier).digest("base64url"),
      );
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
      expect(fixture.openPath).toHaveBeenCalledExactlyOnceWith(fixture.bundle);

      fixture.setSession("second-session");
      await fixture.connect();
      expect(fixture.fetch).toHaveBeenCalledTimes(2);
      expect(fixture.openPath).toHaveBeenCalledTimes(2);
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

    it("retries on the next connection attempt when the helper rejects the code", async () => {
      const fixture = await makeFixture();
      await writeFile(fixture.executable, "#!/bin/sh\nexit 1\n");
      await fixture.connect();
      expect(fixture.onFailure).toHaveBeenCalledOnce();
      expect(fixture.openPath).not.toHaveBeenCalled();
      await fixture.installHelper();
      await fixture.connect();
      expect(fixture.openPath).toHaveBeenCalledOnce();
    });
  },
);

async function makeFixture() {
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
  await mkdir(path.dirname(executable), { recursive: true });

  const installHelper = () =>
    writeFile(
      executable,
      '#!/bin/sh\n[ "$#" -eq 1 ] && [ "$1" = "--auth-handoff" ] || exit 2\nIFS= read -r line || exit 3\nprintf "%s" "$line" > "$0.input"\n',
      { mode: 0o700 },
    );
  await installHelper();

  let sessionValue = "first-session";
  const fetch = vi.fn<Session["fetch"]>(async () =>
    Response.json({ code: "fixture-code" }),
  );
  const openPath = vi.fn<(bundle: string) => Promise<string>>(async () => "");
  const onFailure = vi.fn();
  const newConnection = () =>
    createMenuBarHandoff({
      origin,
      contentsPath,
      markerPath: path.join(contentsPath, "handoff-marker"),
      session: {
        cookies: {
          get: async () =>
            sessionValue
              ? [
                  {
                    name: "__Secure-better-auth.session_token",
                    sameSite: "lax",
                    value: sessionValue,
                  },
                ]
              : [],
        },
        fetch,
      },
      openPath,
      onFailure,
    });

  return {
    bundle,
    executable,
    payloadPath,
    installHelper,
    fetch,
    openPath,
    onFailure,
    newConnection,
    connect: newConnection(),
    setSession: (value: string) => {
      sessionValue = value;
    },
  };
}
