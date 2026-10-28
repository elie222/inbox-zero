import { Agent, setGlobalDispatcher } from "undici";
import { MCP_INTEGRATIONS } from "../../utils/mcp/integrations";

const emulator = new URL(process.env.PLAYWRIGHT_TODOIST_BASE_URL ?? "");
if (
  emulator.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(emulator.hostname)
) {
  throw new Error("Playwright Todoist transport requires a local emulator");
}
const todoist = new URL(MCP_INTEGRATIONS.todoist.serverUrl!);

// Redirect at the test process's transport boundary so the production app's
// bearer-token URL guard and MCP request/response handling are still exercised.
setGlobalDispatcher(
  new Agent().compose((dispatch) => (options, handler) => {
    if (String(options.origin) !== todoist.origin) {
      return dispatch(options, handler);
    }
    const request = new URL(options.path, todoist.origin);
    if (request.pathname !== todoist.pathname) {
      throw new Error(`Unexpected Todoist request path: ${request.pathname}`);
    }
    return dispatch(
      { ...options, origin: emulator.origin, path: `/mcp${request.search}` },
      handler,
    );
  }),
);
