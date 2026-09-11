import { describe, expect, it } from "vitest";
import { safeExpo } from "./expo";

describe("safe Expo Better Auth plugin", () => {
  it("does not install the stock cookie-in-callback redirect hook", () => {
    expect(safeExpo()).not.toHaveProperty("hooks.after");
  });

  it("copies expo-origin into origin for mobile Better Auth requests", async () => {
    const plugin = safeExpo();
    const request = new Request(
      "https://www.getinboxzero.com/api/auth/session",
      {
        headers: {
          "expo-origin": "inboxzero://",
        },
      },
    );

    const result = await plugin.onRequest(request);

    expect(result?.request.headers.get("origin")).toBe("inboxzero://");
  });
});
