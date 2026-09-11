import { expect, it, vi } from "vitest";
import { isMcpServerAvailable } from "@/utils/mcp/config";

const { config } = vi.hoisted(() => ({
  config: {
    NEXT_PUBLIC_BASE_URL: "https://example.com",
    MCP_SERVER_ENABLED: true,
    NEXT_PUBLIC_EXTERNAL_API_ENABLED: true,
  },
}));
vi.mock("@/env", () => ({ env: config }));

it.each([
  ["https://example.com", true],
  ["http://example.com", false],
  ["http://localhost:3000", true],
  ["http://127.0.0.1:3000", true],
  ["http://[::1]:3000", true],
  ["http://localhost.example.com", false],
])("gates MCP bearer-token access at %s", (url, available) => {
  config.NEXT_PUBLIC_BASE_URL = url;
  expect(isMcpServerAvailable()).toBe(available);
});
