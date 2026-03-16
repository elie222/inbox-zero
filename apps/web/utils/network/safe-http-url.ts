import { lookup } from "node:dns/promises";
import type {
  LookupAddress,
  LookupAllOptions,
  LookupOneOptions,
} from "node:dns";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
]);

type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type ResolvedSafeExternalHttpUrl = {
  lookup: (
    hostname: string,
    options: number | LookupOneOptions | LookupAllOptions | undefined,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => void;
  url: URL;
};

export function isSafeExternalHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    const hostname = normalizeHostname(parsed.hostname);
    if (!hostname) return false;
    if (isBlockedHostname(hostname)) return false;

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

export async function resolveSafeExternalHttpUrl(
  url: string,
): Promise<ResolvedSafeExternalHttpUrl | null> {
  if (!isSafeExternalHttpUrl(url)) return null;

  const parsed = new URL(url);
  const hostname = normalizeHostname(parsed.hostname);
  const ipAddress = stripIpv6Brackets(hostname);
  const ipVersion = isIP(ipAddress);

  if (ipVersion === 4 || ipVersion === 6) {
    return {
      url: parsed,
      lookup: createPinnedLookup([
        { address: ipAddress, family: ipVersion as 4 | 6 },
      ]),
    };
  }

  const resolvedAddresses = await resolvePublicAddresses(hostname);
  if (!resolvedAddresses) return null;

  return {
    url: parsed,
    lookup: createPinnedLookup(resolvedAddresses),
  };
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
  const mappedIpv4 = getMappedIpv4Address(normalized);
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

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

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.+$/, "");
}

function isBlockedHostname(hostname: string) {
  return (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localhost")
  );
}

function getMappedIpv4Address(ipv6Address: string) {
  if (!ipv6Address.startsWith("::ffff:")) return null;

  const mappedAddress = ipv6Address.slice(7);
  if (isIP(mappedAddress) === 4) return mappedAddress;

  const mappedSegments = mappedAddress.split(":");
  if (mappedSegments.length !== 2) return null;

  const [highHex, lowHex] = mappedSegments;
  if (!highHex || !lowHex) return null;
  if (!/^[0-9a-f]{1,4}$/i.test(highHex)) return null;
  if (!/^[0-9a-f]{1,4}$/i.test(lowHex)) return null;

  const high = Number.parseInt(highHex, 16);
  const low = Number.parseInt(lowHex, 16);

  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

async function resolvePublicAddresses(
  hostname: string,
): Promise<ResolvedAddress[] | null> {
  const results = await lookup(hostname, {
    all: true,
    verbatim: true,
  });

  if (!results.length) {
    throw Object.assign(new Error("DNS lookup returned no results"), {
      code: "ENOTFOUND",
    });
  }

  const addresses = results.map((result) => ({
    address: stripIpv6Brackets(result.address),
    family: result.family as 4 | 6,
  }));

  if (addresses.some((result) => isResolvedAddressPrivate(result.address))) {
    return null;
  }

  return addresses;
}

function isResolvedAddressPrivate(address: string) {
  const ipVersion = isIP(address);
  if (ipVersion === 4) return isPrivateIpv4(address);
  if (ipVersion === 6) return isPrivateIpv6(address);
  return true;
}

function createPinnedLookup(addresses: ResolvedAddress[]) {
  let nextIndex = 0;

  return (
    _hostname: string,
    options: number | LookupOneOptions | LookupAllOptions | undefined,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    const normalizedOptions =
      typeof options === "number" ? { family: options } : options || {};
    const requestedFamily = normalizedOptions.family;

    const matchingAddresses =
      requestedFamily === 4 || requestedFamily === 6
        ? addresses.filter((result) => result.family === requestedFamily)
        : addresses;

    if (!matchingAddresses.length) {
      callback(
        Object.assign(new Error("No safe address available"), {
          code: "ENOTFOUND",
        }),
        "",
      );
      return;
    }

    if ("all" in normalizedOptions && normalizedOptions.all) {
      callback(
        null,
        matchingAddresses.map((result) => ({
          address: result.address,
          family: result.family,
        })),
      );
      return;
    }

    const selected = matchingAddresses[nextIndex % matchingAddresses.length];
    nextIndex += 1;

    callback(null, selected.address, selected.family);
  };
}
