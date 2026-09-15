import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export async function resolvePublicAddress(
  hostname: string,
  excluded: string[] = [],
) {
  if (!hostname || hostname.endsWith(".") || hostname.includes(":"))
    throw new Error("Destination denied");
  const addresses = await lookup(hostname, { all: true, family: 4 });
  if (
    !addresses.length ||
    addresses.some(
      ({ address }) => !isPublicAddress(address) || excluded.includes(address),
    )
  ) {
    throw new Error("Destination denied");
  }
  return addresses[0].address;
}

export function isPublicAddress(address: string) {
  try {
    const parsed = ipaddr.parse(address);
    return parsed.kind() === "ipv4" && parsed.range() === "unicast";
  } catch {
    return false;
  }
}
