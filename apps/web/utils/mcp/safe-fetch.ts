import type { LookupAddress } from "node:dns";
import {
  Agent,
  fetch as undiciFetch,
  type RequestInit as UndiciRequestInit,
} from "undici";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { env } from "@/env";
import type { ResolvedMcpIntegration } from "@/utils/mcp/resolve-integration";
import {
  isSafeExternalHttpUrl,
  resolveSafeExternalHttpUrl,
} from "@/utils/network/safe-http-url";

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * Built-in integrations point at endpoints we control, so they use the default
 * fetch. User-registered servers go through the guarded one.
 */
export function getMcpFetch(
  integration: ResolvedMcpIntegration,
): FetchLike | undefined {
  return integration.isCustom ? safeMcpFetch : undefined;
}

const safeMcpAgent = new Agent({ connect: { lookup: safeLookup } });

/**
 * Fetch for user-registered MCP servers. Every URL here is user controlled, so
 * the target is re-checked (undici skips the lookup hook for IP literals),
 * hostname connections are pinned to addresses that passed the SSRF guard, and
 * redirects are refused because they would skip both checks.
 *
 * Uses undici's own fetch because the pinned-DNS dispatcher comes from the
 * undici package, which Node's global fetch rejects across versions.
 */
const safeMcpFetch: FetchLike = async (url, init) => {
  const target = url.toString();

  const allowPrivateIps = env.MCP_ALLOW_PRIVATE_IPS;

  if (!allowPrivateIps && !target.startsWith("https://")) {
    throw new Error("Custom MCP servers must use https");
  }

  if (!isSafeExternalHttpUrl(target, { allowPrivateIps })) {
    throw new Error(
      `Refusing to call ${safeHost(target)}: the address is not a public host`,
    );
  }

  const response = await undiciFetch(target, {
    ...(init as UndiciRequestInit),
    redirect: "manual",
    dispatcher: safeMcpAgent,
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      `Refusing to follow a redirect from ${safeHost(target)}: custom MCP servers may not redirect`,
    );
  }

  return response as unknown as Response;
};

function safeLookup(
  hostname: string,
  options: unknown,
  callback: LookupCallback,
) {
  const allowPrivateIps = env.MCP_ALLOW_PRIVATE_IPS;

  const host = hostname.includes(":") ? `[${hostname}]` : hostname;

  resolveSafeExternalHttpUrl(`https://${host}`, { allowPrivateIps })
    .then((resolved) => {
      if (!resolved) {
        callback(
          Object.assign(
            new Error(`Refusing to call ${hostname}: not a public host`),
            { code: "ENOTFOUND" },
          ),
          "",
        );
        return;
      }

      resolved.lookup(hostname, options as never, callback);
    })
    .catch((error) => callback(error as NodeJS.ErrnoException, ""));
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "the server";
  }
}
