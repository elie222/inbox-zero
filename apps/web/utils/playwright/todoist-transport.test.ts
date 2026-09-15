import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { MCP_INTEGRATIONS } from "../mcp/integrations";

const execFileAsync = promisify(execFile);

test("production fetch reaches the Todoist emulator with its MCP body and token intact", async () => {
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        path: request.url,
        method: request.method,
        authorization: request.headers.authorization,
        body,
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--import",
        "./__tests__/playwright/todoist-transport.ts",
        "--input-type=module",
        "--eval",
        `const response = await fetch(${JSON.stringify(MCP_INTEGRATIONS.todoist.serverUrl)}, {
          method: "POST",
          headers: { authorization: "Bearer emulator-token", "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
          signal: AbortSignal.timeout(5000),
        });
        const other = await fetch(${JSON.stringify(`${origin}/unrelated`)});
        console.log(JSON.stringify({ mcp: await response.json(), other: await other.json() }));`,
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: "production",
          PLAYWRIGHT_TODOIST_BASE_URL: origin,
        },
        timeout: 10_000,
      },
    );
    expect(JSON.parse(stdout)).toMatchObject({
      mcp: {
        path: "/mcp",
        method: "POST",
        authorization: "Bearer emulator-token",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      },
      other: { path: "/unrelated", method: "GET" },
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("refuses a non-local Todoist emulator destination", async () => {
  await expect(
    execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--import",
        "./__tests__/playwright/todoist-transport.ts",
        "--eval",
        "",
      ],
      {
        env: {
          ...process.env,
          PLAYWRIGHT_TODOIST_BASE_URL: "https://example.com",
        },
        timeout: 10_000,
      },
    ),
  ).rejects.toThrow("requires a local emulator");
});
