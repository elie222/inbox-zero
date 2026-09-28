import { lookup } from "node:dns/promises";
import type {
  LookupAddress,
  LookupAllOptions,
  LookupOneOptions,
} from "node:dns";
import { isIP } from "node:net";
import { stripIpv6Brackets } from "./upstream-host-policy";

type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type PinnedLookup = (
  hostname: string,
  options: number | LookupOneOptions | LookupAllOptions | undefined,
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
) => void;

export async function resolveHostAddresses(
  hostname: string,
): Promise<ResolvedAddress[]> {
  const ipAddress = stripIpv6Brackets(hostname);
  const ipVersion = isIP(ipAddress);
  if (ipVersion === 4 || ipVersion === 6) {
    return [{ address: ipAddress, family: ipVersion }];
  }

  const results = await lookup(hostname, {
    all: true,
    verbatim: true,
  });

  if (!results.length) {
    throw Object.assign(new Error("DNS lookup returned no results"), {
      code: "ENOTFOUND",
    });
  }

  return results.map((result) => ({
    address: stripIpv6Brackets(result.address),
    family: result.family as 4 | 6,
  }));
}

export function createPinnedLookup(addresses: ResolvedAddress[]): PinnedLookup {
  let nextIndex = 0;

  return (_hostname, options, callback) => {
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
