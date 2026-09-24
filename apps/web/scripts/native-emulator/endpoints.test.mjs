import assert from "node:assert/strict";
import { test } from "node:test";
import { assertLocalTargets } from "./endpoints.mjs";

test("loopback emulator URLs are accepted", () => {
  assert.doesNotThrow(() =>
    assertLocalTargets({
      NEXT_PUBLIC_BASE_URL: "http://127.0.0.1:3000",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5433/native",
      REDIS_URL: "redis://localhost:6380",
    }),
  );
});

test("remote hosts are refused before any process starts", () => {
  assert.throws(
    () =>
      assertLocalTargets({ GOOGLE_BASE_URL: "https://gmail.googleapis.com" }),
    /loopback/,
  );
  assert.throws(
    () =>
      assertLocalTargets({
        DATABASE_URL: "postgresql://postgres:secret@db.example.com/inboxzero",
      }),
    /loopback/,
  );
});
