import ipaddr from "ipaddr.js";

const BLOCKED_HOSTNAMES = new Set([
  "ip6-localhost",
  "ip6-loopback",
  "localhost",
  "localhost.localdomain",
  "metadata.gcp.internal",
  "metadata.google.internal",
]);

const BLOCKED_IP_RANGES = new Set([
  "6to4",
  "broadcast",
  "carrierGradeNat",
  "ipv4Mapped",
  "linkLocal",
  "loopback",
  "multicast",
  "private",
  "rfc6052",
  "rfc6145",
  "reserved",
  "teredo",
  "uniqueLocal",
  "unspecified",
]);

export function isBlockedHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return true;

  return (
    BLOCKED_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".localhost") ||
    isSingleLabelHostname(normalized) ||
    isBlockedIpAddress(normalized)
  );
}

export function normalizeHostname(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/g, "");
}

export function isSingleLabelHostname(hostname: string) {
  return !hostname.includes(".") && !hostname.includes(":");
}

export function stripIpv6Brackets(hostname: string) {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }

  return hostname;
}

function isBlockedIpAddress(hostname: string) {
  const candidate = stripIpv6Brackets(hostname);
  if (
    looksLikeIpv4Address(candidate) &&
    !ipaddr.IPv4.isValidFourPartDecimal(candidate)
  ) {
    return true;
  }

  if (candidate.includes(":") && !ipaddr.isValid(candidate)) {
    return true;
  }

  if (!ipaddr.isValid(candidate)) return false;

  const address = ipaddr.process(candidate);
  return BLOCKED_IP_RANGES.has(address.range());
}

function looksLikeIpv4Address(hostname: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}
