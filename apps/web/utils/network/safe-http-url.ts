import { isIP } from "node:net";

export function isSafeExternalHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (!hostname) return false;
    if (hostname === "localhost" || hostname.endsWith(".local")) return false;

    const ipAddress = stripIpv6Brackets(hostname);
    const ipVersion = isIP(ipAddress);
    if (ipVersion === 4) return !isPrivateIpv4(ipAddress);
    if (ipVersion === 6) return !isPrivateIpv6(ipAddress);

    if (!hostname.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) {
    return true;
  }

  const [first, second] = octets;
  if (first === 10) return true;
  if (first === 127) return true;
  if (first === 0) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first === 198 && (second === 18 || second === 19)) return true;
  if (first >= 224) return true;

  return false;
}

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function stripIpv6Brackets(hostname: string) {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }

  return hostname;
}
