// Connectivity failures while offline, asleep, or switching networks. The mail
// engine and updater retry on their own, so these aren't worth reporting.
// TLS and HTTP failures are left out: they point at a real problem.
const TRANSIENT_NODE_CODES = new Set([
  "EAI_AGAIN",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const TRANSIENT_CHROMIUM_ERRORS = new Set([
  "net::ERR_ADDRESS_UNREACHABLE",
  "net::ERR_CONNECTION_ABORTED",
  "net::ERR_CONNECTION_CLOSED",
  "net::ERR_CONNECTION_REFUSED",
  "net::ERR_CONNECTION_RESET",
  "net::ERR_CONNECTION_TIMED_OUT",
  "net::ERR_INTERNET_DISCONNECTED",
  "net::ERR_NAME_NOT_RESOLVED",
  "net::ERR_NETWORK_CHANGED",
  "net::ERR_NETWORK_IO_SUSPENDED",
  "net::ERR_TIMED_OUT",
]);

export function isTransientNetworkError(error: unknown): boolean {
  // Node's fetch throws a generic "fetch failed" with the socket error as its cause.
  let current = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    if (current.name === "AbortError" || current.name === "TimeoutError") {
      return true;
    }
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && TRANSIENT_NODE_CODES.has(code)) return true;
    if (TRANSIENT_CHROMIUM_ERRORS.has(current.message)) return true;
    // Connecting to every address of a host fails with one error per address.
    if (
      current instanceof AggregateError &&
      current.errors.some(isTransientNetworkError)
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}
