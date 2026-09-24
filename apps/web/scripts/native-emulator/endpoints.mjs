const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertLocalTargets(env) {
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    if (value.startsWith("postgres") || value.startsWith("redis:")) {
      const asHttp = value
        .replace(/^postgres(?:ql)?:/, "http:")
        .replace(/^redis:/, "http:");
      assertLoopbackUrl(key, asHttp);
      continue;
    }
    if (value.startsWith("http://") || value.startsWith("https://")) {
      assertLoopbackUrl(key, value);
    }
  }
}

function assertLoopbackUrl(key, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} is not a URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${key} must use http on the local emulator`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      `${key} must stay on loopback. Refusing to point the native emulator at ${url.hostname}.`,
    );
  }
}
