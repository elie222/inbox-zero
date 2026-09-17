const FORBIDDEN_SCHEMES = new Set([
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "ftp:",
  "mailto:",
  "ws:",
  "wss:",
]);

type ClientRegistrationBody = {
  application_type?: string | null;
  redirect_uris?: unknown;
};

export function applyNativeMcpClientRegistration(
  body: ClientRegistrationBody | null | undefined,
) {
  if (!body || body.application_type === "native") return;
  if (
    body.application_type != null &&
    body.application_type !== "web" &&
    body.application_type !== ""
  ) {
    return;
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter(
        (uri): uri is string => typeof uri === "string" && uri.length > 0,
      )
    : [];
  if (redirectUris.length === 0) return;
  if (!redirectUris.every(isNativeAcceptableRedirectUri)) return;
  if (redirectUris.every(isWebValidRedirectUri)) return;

  body.application_type = "native";
}

function isWebValidRedirectUri(redirectUri: string) {
  const url = parseRedirectUri(redirectUri);
  if (url?.protocol !== "https:") return false;
  return !isLoopbackHost(url.hostname);
}

function isNativeAcceptableRedirectUri(redirectUri: string) {
  const url = parseRedirectUri(redirectUri);
  if (!url || FORBIDDEN_SCHEMES.has(url.protocol)) return false;
  if (redirectUri.includes("#") || url.username || url.password) return false;

  if (url.protocol === "https:") return !isLoopbackHost(url.hostname);
  if (url.protocol === "http:") {
    const host = rawHttpHostname(redirectUri);
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  }
  return (
    url.pathname.startsWith("/") &&
    (url.host.length > 0 || url.pathname !== "/")
  );
}

function parseRedirectUri(redirectUri: string) {
  try {
    return new URL(redirectUri);
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function rawHttpHostname(redirectUri: string) {
  const authority = /^http:\/\/([^/?#]*)/i.exec(redirectUri)?.[1];
  if (!authority) return null;
  const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1);
  if (hostAndPort.startsWith("[")) {
    const bracketEnd = hostAndPort.indexOf("]");
    return bracketEnd < 0
      ? null
      : hostAndPort.slice(0, bracketEnd + 1).toLowerCase();
  }
  return (hostAndPort.split(":")[0] ?? "").toLowerCase();
}
