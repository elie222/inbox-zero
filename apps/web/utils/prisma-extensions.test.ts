import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    EMAIL_ENCRYPT_SECRET: "test-secret-key-for-encryption-testing",
    EMAIL_ENCRYPT_SALT: "test-salt-for-encryption",
  },
}));

vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    defineExtension: (fn: unknown) => fn,
  },
}));

import { __testing__ } from "./prisma-extensions";

const { buildQuery, encryptCreateData, encryptUpdateData } = __testing__;

const FIELDS = ["webhookSecret"] as const;

describe("encryptCreateData", () => {
  it("encrypts a string field", () => {
    const data: Record<string, unknown> = { webhookSecret: "hunter2" };
    encryptCreateData(data, FIELDS);
    expect(data.webhookSecret).toMatch(/^v1:[0-9a-f]+$/);
  });

  it("leaves null untouched", () => {
    const data: Record<string, unknown> = { webhookSecret: null };
    encryptCreateData(data, FIELDS);
    expect(data.webhookSecret).toBeNull();
  });

  it("leaves absent fields absent", () => {
    const data: Record<string, unknown> = { otherField: "unchanged" };
    encryptCreateData(data, FIELDS);
    expect("webhookSecret" in data).toBe(false);
  });

  it("ignores non-string values", () => {
    const data: Record<string, unknown> = { webhookSecret: 42 };
    encryptCreateData(data, FIELDS);
    expect(data.webhookSecret).toBe(42);
  });

  it("no-ops when data is null or undefined", () => {
    expect(() => encryptCreateData(null, FIELDS)).not.toThrow();
    expect(() => encryptCreateData(undefined, FIELDS)).not.toThrow();
  });
});

describe("encryptUpdateData", () => {
  it("encrypts a flat string value", () => {
    const data: Record<string, unknown> = { webhookSecret: "hunter2" };
    encryptUpdateData(data, FIELDS);
    expect(data.webhookSecret).toMatch(/^v1:[0-9a-f]+$/);
  });

  it("encrypts the inner value of a { set } wrapper", () => {
    const data: Record<string, unknown> = {
      webhookSecret: { set: "hunter2" },
    };
    encryptUpdateData(data, FIELDS);
    expect((data.webhookSecret as { set: string }).set).toMatch(
      /^v1:[0-9a-f]+$/,
    );
  });

  it("leaves { set: null } untouched (clearing a field)", () => {
    const data: Record<string, unknown> = {
      webhookSecret: { set: null },
    };
    encryptUpdateData(data, FIELDS);
    expect((data.webhookSecret as { set: null }).set).toBeNull();
  });

  it("leaves null untouched", () => {
    const data: Record<string, unknown> = { webhookSecret: null };
    encryptUpdateData(data, FIELDS);
    expect(data.webhookSecret).toBeNull();
  });

  it("leaves absent fields absent", () => {
    const data: Record<string, unknown> = {};
    encryptUpdateData(data, FIELDS);
    expect(data).toEqual({});
  });

  it("ignores wrapper objects without a `set` key", () => {
    const data: Record<string, unknown> = {
      webhookSecret: { increment: 1 },
    };
    encryptUpdateData(data, FIELDS);
    expect(data.webhookSecret).toEqual({ increment: 1 });
  });
});

describe("buildQuery handlers", () => {
  const spec = { user: ["webhookSecret"] } as const;
  const queryFn = vi.fn(async (args: unknown) => args);

  beforeEach(() => {
    queryFn.mockClear();
  });

  it("create encrypts args.data and forwards to query()", async () => {
    const handlers = buildQuery(spec);
    const args = { data: { webhookSecret: "hunter2" } };
    await handlers.user.create({ args, query: queryFn });
    expect(args.data.webhookSecret).toMatch(/^v1:[0-9a-f]+$/);
    expect(queryFn).toHaveBeenCalledWith(args);
  });

  it("update encrypts args.data", async () => {
    const handlers = buildQuery(spec);
    const args = { data: { webhookSecret: "hunter2" } };
    await handlers.user.update({ args, query: queryFn });
    expect(args.data.webhookSecret).toMatch(/^v1:[0-9a-f]+$/);
  });

  it("updateMany encrypts args.data", async () => {
    const handlers = buildQuery(spec);
    const args = { data: { webhookSecret: "hunter2" } };
    await handlers.user.updateMany({ args, query: queryFn });
    expect(args.data.webhookSecret).toMatch(/^v1:[0-9a-f]+$/);
  });

  it("upsert encrypts both create and update branches independently", async () => {
    const handlers = buildQuery(spec);
    const args = {
      create: { webhookSecret: "created-value" },
      update: { webhookSecret: { set: "updated-value" } },
    };
    await handlers.user.upsert({ args, query: queryFn });
    expect(args.create.webhookSecret).toMatch(/^v1:[0-9a-f]+$/);
    expect(args.update.webhookSecret.set).toMatch(/^v1:[0-9a-f]+$/);
  });
});
