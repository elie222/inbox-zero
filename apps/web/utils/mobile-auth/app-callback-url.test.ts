import { describe, expect, it } from "vitest";
import { getInboxZeroCustomSchemeCallbackUrl } from "./app-callback-url";

describe("getInboxZeroCustomSchemeCallbackUrl", () => {
  it("opens the desktop app with a one-time code and state", () => {
    expect(
      getInboxZeroCustomSchemeCallbackUrl({
        code: "xz5IkObSXqOpdCvBARrwRnqhOrxRQNX9qPeoT9G-jws",
        state: "ADUZf5bSBOBSBzj58yThh17uiqgEg1PmsNzu-s4cMMA",
      }),
    ).toBe(
      "inboxzero://auth-callback?state=ADUZf5bSBOBSBzj58yThh17uiqgEg1PmsNzu-s4cMMA&code=xz5IkObSXqOpdCvBARrwRnqhOrxRQNX9qPeoT9G-jws",
    );
  });

  it("opens the desktop app with auth errors", () => {
    expect(
      getInboxZeroCustomSchemeCallbackUrl({
        error: "missing_session",
        error_description: "Authentication session was not found",
        state: "ADUZf5bSBOBSBzj58yThh17uiqgEg1PmsNzu-s4cMMA",
      }),
    ).toBe(
      "inboxzero://auth-callback?state=ADUZf5bSBOBSBzj58yThh17uiqgEg1PmsNzu-s4cMMA&error=missing_session&error_description=Authentication+session+was+not+found",
    );
  });

  it("ignores extra query values that are not part of the handoff", () => {
    expect(
      getInboxZeroCustomSchemeCallbackUrl({
        code: "xz5IkObSXqOpdCvBARrwRnqhOrxRQNX9qPeoT9G-jws",
        cookie: "better-auth.session_token=session",
        next: "https://evil.example",
        state: "ADUZf5bSBOBSBzj58yThh17uiqgEg1PmsNzu-s4cMMA",
      }),
    ).toBe(
      "inboxzero://auth-callback?state=ADUZf5bSBOBSBzj58yThh17uiqgEg1PmsNzu-s4cMMA&code=xz5IkObSXqOpdCvBARrwRnqhOrxRQNX9qPeoT9G-jws",
    );
  });

  it("does not open the app without a code or error", () => {
    expect(
      getInboxZeroCustomSchemeCallbackUrl({
        state: "ADUZf5bSBOBSBzj58yThh17uiqgEg1PmsNzu-s4cMMA",
      }),
    ).toBeNull();
  });
});
