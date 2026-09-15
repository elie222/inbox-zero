import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress } from "./network.ts";
import { jobSchema } from "./contracts.ts";
import { randomUUID } from "node:crypto";

test("rejects private, loopback, metadata, reserved and mapped addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.17.0.2",
    "192.168.1.2",
    "169.254.169.254",
    "100.100.100.200",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "192.0.2.1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("8.8.8.8"), true);
});

test("rejects credentials, plaintext and non-HTTPS ports", () => {
  for (const url of [
    "http://example.com",
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "https://example.com:8080",
  ]) {
    assert.equal(
      jobSchema.safeParse({
        jobId: randomUUID(),
        url,
        recipientEmail: "user@example.com",
      }).success,
      false,
    );
  }
});
