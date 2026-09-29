import { describe, expect, it } from "vitest";
import { isBlockedHostname } from "./host-policy";

describe("isBlockedHostname", () => {
  it.each([
    ["localhost"],
    ["printer.local"],
    ["intranet"],
    ["metadata.google.internal"],
    ["127.0.0.1"],
    ["10.0.0.1"],
    ["169.254.169.254"],
    ["100.64.0.1"],
    ["0.0.0.0"],
    ["[::1]"],
    ["[::ffff:127.0.0.1]"],
    ["[::ffff:7f00:1]"],
    ["[fd00::1]"],
    ["[fe80::1]"],
    ["[64:ff9b::7f00:1]"],
    ["[2002:7f00:1::]"],
    ["[2001::1]"],
    ["[ff02::1]"],
    ["[2001:db8::1]"],
  ])("blocks %s", (hostname) => {
    expect(isBlockedHostname(hostname)).toBe(true);
  });

  it.each([
    ["example.com"],
    ["8.8.8.8"],
    ["[2606:4700:4700::1111]"],
  ])("allows public host %s", (hostname) => {
    expect(isBlockedHostname(hostname)).toBe(false);
  });
});
