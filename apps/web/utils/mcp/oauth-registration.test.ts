import { describe, expect, it } from "vitest";
import { applyNativeMcpClientRegistration } from "@/utils/mcp/oauth-registration";

describe("applyNativeMcpClientRegistration", () => {
  it("coerces Cursor's web + cursor:// registration to native", () => {
    const body = {
      application_type: "web",
      redirect_uris: ["cursor://anysphere.cursor-mcp/oauth/callback"],
    };
    applyNativeMcpClientRegistration(body);
    expect(body.application_type).toBe("native");
  });

  it("classifies an omitted application_type as native for loopback http", () => {
    const body: { application_type?: string; redirect_uris: string[] } = {
      redirect_uris: ["http://localhost:8787/callback"],
    };
    applyNativeMcpClientRegistration(body);
    expect(body.application_type).toBe("native");
  });

  it("leaves https web clients unchanged", () => {
    const body = {
      application_type: "web",
      redirect_uris: ["https://client.example.com/callback"],
    };
    applyNativeMcpClientRegistration(body);
    expect(body.application_type).toBe("web");
  });

  it("does not override an explicit native registration", () => {
    const body = {
      application_type: "native",
      redirect_uris: ["https://client.example.com/callback"],
    };
    applyNativeMcpClientRegistration(body);
    expect(body.application_type).toBe("native");
  });

  it("does not coerce javascript: redirect URIs", () => {
    const body = {
      application_type: "web",
      redirect_uris: ["javascript:alert(1)"],
    };
    applyNativeMcpClientRegistration(body);
    expect(body.application_type).toBe("web");
  });
});
